//! Search across the markdown files of a folder.

use super::folder::is_markdown;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_MATCHES: usize = 2_000;
const MAX_MATCHES_PER_FILE: usize = 100;
const SNIPPET_CHARS: usize = 160;
const CONTEXT_BEFORE: usize = 40;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub regex: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineMatch {
    /// 1-based line number.
    pub line: usize,
    /// The line (or a window of it, for long lines).
    pub text: String,
    /// Highlight ranges in `text`, in UTF-16 code units (JavaScript string indices).
    pub ranges: Vec<(usize, usize)>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMatches {
    pub path: String,
    pub matches: Vec<LineMatch>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub files: Vec<FileMatches>,
    pub total: usize,
    pub truncated: bool,
}

pub fn build_regex(options: &SearchOptions) -> Result<Regex, String> {
    let pattern = if options.regex {
        options.query.clone()
    } else {
        regex::escape(&options.query)
    };
    let pattern = if options.whole_word {
        format!(r"\b(?:{pattern})\b")
    } else {
        pattern
    };
    RegexBuilder::new(&pattern)
        .case_insensitive(!options.case_sensitive)
        .size_limit(1 << 20)
        .build()
        .map_err(|e| format!("Invalid regular expression: {e}"))
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// Cuts long lines around the first match and converts byte ranges to UTF-16 ranges.
fn snippet(line: &str, byte_ranges: &[(usize, usize)]) -> (String, Vec<(usize, usize)>) {
    let first = byte_ranges.first().map_or(0, |r| r.0);
    let mut start = 0;
    if line[..first].chars().count() > CONTEXT_BEFORE {
        start = line[..first]
            .char_indices()
            .rev()
            .nth(CONTEXT_BEFORE - 1)
            .map_or(0, |(i, _)| i);
    }
    let end = line[start..]
        .char_indices()
        .nth(SNIPPET_CHARS)
        .map_or(line.len(), |(i, _)| start + i);
    let prefix = if start > 0 { "…" } else { "" };
    let text = format!(
        "{prefix}{}{}",
        &line[start..end],
        if end < line.len() { "…" } else { "" }
    );
    let offset = utf16_len(prefix);
    let ranges = byte_ranges
        .iter()
        .filter(|(s, e)| *s >= start && *e <= end)
        .map(|(s, e)| {
            (
                offset + utf16_len(&line[start..*s]),
                offset + utf16_len(&line[start..*e]),
            )
        })
        .collect();
    (text, ranges)
}

pub fn search_text(text: &str, re: &Regex, limit: usize) -> Vec<LineMatch> {
    let mut out = Vec::new();
    for (index, line) in text.lines().enumerate() {
        let ranges: Vec<(usize, usize)> = re
            .find_iter(line)
            .filter(|m| m.start() != m.end())
            .map(|m| (m.start(), m.end()))
            .collect();
        if ranges.is_empty() {
            continue;
        }
        let (text, ranges) = snippet(line, &ranges);
        out.push(LineMatch {
            line: index + 1,
            text,
            ranges,
        });
        if out.len() >= limit {
            break;
        }
    }
    out
}

pub fn search(root: &Path, options: &SearchOptions) -> Result<SearchResults, String> {
    if options.query.is_empty() {
        return Ok(SearchResults {
            files: vec![],
            total: 0,
            truncated: false,
        });
    }
    let re = build_regex(options)?;
    let mut results = SearchResults {
        files: vec![],
        total: 0,
        truncated: false,
    };
    let walker = ignore::WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .require_git(false)
        .build();
    for entry in walker.filter_map(Result::ok) {
        let path = entry.path();
        if !entry.file_type().is_some_and(|t| t.is_file()) || !is_markdown(path) {
            continue;
        }
        let Ok(text) = fs::read_to_string(path) else {
            continue;
        };
        let remaining = MAX_MATCHES - results.total;
        let matches = search_text(&text, &re, remaining.min(MAX_MATCHES_PER_FILE));
        if matches.is_empty() {
            continue;
        }
        results.total += matches.len();
        results.files.push(FileMatches {
            path: path.to_string_lossy().into_owned(),
            matches,
        });
        if results.total >= MAX_MATCHES {
            results.truncated = true;
            break;
        }
    }
    results.files.sort_by_key(|f| f.path.to_lowercase());
    Ok(results)
}

#[tauri::command]
pub async fn search_folder(root: PathBuf, options: SearchOptions) -> Result<SearchResults, String> {
    tauri::async_runtime::spawn_blocking(move || search(&root, &options))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(query: &str) -> SearchOptions {
        SearchOptions {
            query: query.into(),
            case_sensitive: false,
            whole_word: false,
            regex: false,
        }
    }

    #[test]
    fn finds_matches_with_utf16_ranges() {
        let re = build_regex(&opts("café")).unwrap();
        let matches = search_text("😀 un Café\nnothing\nCAFÉ!", &re, 10);
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].line, 1);
        // "😀" is two UTF-16 units: "😀 un " = 6 units.
        assert_eq!(matches[0].ranges, vec![(6, 10)]);
        assert_eq!(matches[1].line, 3);
    }

    #[test]
    fn respects_whole_word_and_case() {
        let mut o = opts("note");
        o.whole_word = true;
        o.case_sensitive = true;
        let re = build_regex(&o).unwrap();
        assert_eq!(
            search_text("notes Note note", &re, 10)[0].ranges,
            vec![(11, 15)]
        );
    }

    #[test]
    fn escapes_plain_queries_and_reports_bad_regex() {
        assert!(build_regex(&opts("a.b(")).is_ok());
        let mut o = opts("a(");
        o.regex = true;
        assert!(build_regex(&o).is_err());
    }

    #[test]
    fn shortens_long_lines_around_the_match() {
        let line = format!("{}needle{}", "x".repeat(500), "y".repeat(500));
        let re = build_regex(&opts("needle")).unwrap();
        let m = &search_text(&line, &re, 10)[0];
        assert!(m.text.starts_with('…') && m.text.ends_with('…'));
        let (s, e) = m.ranges[0];
        let units: Vec<u16> = m.text.encode_utf16().collect();
        assert_eq!(String::from_utf16(&units[s..e]).unwrap(), "needle");
    }

    #[test]
    fn searches_only_markdown_files_in_a_folder() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "hello world").unwrap();
        fs::write(dir.path().join("b.txt"), "hello").unwrap();
        let results = search(dir.path(), &opts("hello")).unwrap();
        assert_eq!(results.files.len(), 1);
        assert_eq!(results.total, 1);
    }
}

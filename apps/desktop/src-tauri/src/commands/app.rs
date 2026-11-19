use serde::Serialize;

/// Static information about the running app, read once by the frontend at startup.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct AppInfo {
    pub version: &'static str,
    /// `windows`, `macos`, `linux`, `android` or `ios`.
    pub os: &'static str,
}

pub fn current_app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
    }
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    current_app_info()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_crate_version_and_os() {
        let info = current_app_info();
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert!(["windows", "macos", "linux", "android", "ios"].contains(&info.os));
    }
}

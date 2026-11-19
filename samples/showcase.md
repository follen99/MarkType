# MarkType showcase

A file to try the editor. Click on **bold text**, *italic text*, `inline code`, ~~strikethrough~~,
<u>underline</u> or a [link](https://github.com/follen99/MarkType "MarkType on GitHub") and the markdown
syntax appears around it. Ctrl+click opens the link.

## Headings

### Third level

#### Fourth level

##### Fifth level

###### Sixth level

## Lists

- Bullet item
- Another item
  - Nested item
- Last item

1. First
2. Second
3. Third

- [x] A completed task
- [ ] A task to do: click the checkbox

## Quote and alert

> Simplicity is prerequisite for reliability.
>
> > A nested quote.

> [!TIP]
> GitHub alerts are kept intact when you save.

## Code

```rust
fn main() {
    println!("Hello from MarkType");
}
```

## Table

| Feature | Shortcut | Status |
| :------ | :------: | -----: |
| Bold    |  Ctrl+B  |   done |
| Heading |  Ctrl+1  |   done |
| Source  |  Ctrl+/  |   done |

---

## Shown as source for now

These are rendered in a later milestone (M3), but they survive saving unchanged:

$$
E = mc^2
$$

Inline math $a^2 + b^2 = c^2$, a footnote[^1] and an HTML block:

<details>
  <summary>Click me</summary>
  Hidden content.
</details>

[^1]: The footnote text.

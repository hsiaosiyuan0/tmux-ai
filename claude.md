# Development Guidelines

## Git Commit Messages

- Use **English** for all commit messages
- Follow the **Conventional Commits** specification: https://www.conventionalcommits.org

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Changes that do not affect the meaning of the code (formatting, etc.) |
| `refactor` | A code change that neither fixes a bug nor adds a feature |
| `perf` | A code change that improves performance |
| `test` | Adding missing tests or correcting existing tests |
| `chore` | Changes to the build process or auxiliary tools |

### Examples

```
feat: add backup restore functionality
fix: handle empty backup list gracefully
docs: update README with installation instructions
refactor: extract askChoice into separate function
chore: remove bun.lock file
```

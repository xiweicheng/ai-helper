# NPM Publish Guide

## Environment

| Item | Value |
|------|-------|
| Package name | `ai-helper-agent` |
| Official registry | `https://registry.npmjs.org/` |
| Mirror registry | `https://registry.npmmirror.com/` (cnpm mirror, faster for `npm install`) |

> Global npm registry is configured to use the cnpm mirror for daily dependency installs. **Only when publishing, use `--registry` to temporarily point to the official source.**

## Publish Workflow

### 1. Check current version

```bash
cd agent
node -e "console.log(require('./package.json').version)"
```

### 2. Bump version

```bash
# Patch (bug fixes): 1.1.0 → 1.1.1
npm version patch

# Minor (new features, backward compatible): 1.1.0 → 1.2.0
npm version minor

# Major (breaking changes): 1.1.0 → 2.0.0
npm version 2.0.0
```

This command auto-updates the `version` field in `package.json` and creates a git tag.

### 3. Check login status

```bash
npm whoami --registry https://registry.npmjs.org/
```

If you see `ENEEDAUTH`, log in first:

```bash
npm login --registry https://registry.npmjs.org/
```

### 4. Publish

```bash
npm publish --registry https://registry.npmjs.org/
```

> The `--registry` flag only affects this command and does not change the global config. After publishing, `npm install` still uses the cnpm mirror.

### 5. Verify publication

```bash
npm view ai-helper-agent version --registry https://registry.npmjs.org/
```

### 6. Install test

```bash
npm install -g ai-helper-agent --registry https://registry.npmjs.org/
```

## FAQ

### Version already exists

```
npm error 403 Version 1.2.0 already exists
```

Solution: Bump the version and publish again.

### Not logged in

```bash
npm login --registry https://registry.npmjs.org/
# Enter username, password, email, and OTP (if 2FA is enabled)
```

### Publish rejected (403)

- Check if package name is taken: `npm view <package-name> --registry https://registry.npmjs.org/`
- Check if email is verified
- Check if account is restricted

### Unpublish a version

```bash
# Unpublish a version within 72 hours of publishing
npm unpublish ai-helper-agent@1.2.0 --registry https://registry.npmjs.org/
```

## Install Test

```bash
# After publishing, the cnpm mirror usually syncs within 10 minutes. Install latest:
npm install -g ai-helper-agent

# Or install directly from the official registry
npm install -g ai-helper-agent --registry https://registry.npmjs.org/
```

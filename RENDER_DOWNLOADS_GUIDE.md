# Render Downloads Guide

## 1) Build installers

You cannot build `.dmg` on Windows.

Use GitHub Actions workflow in this repo to build:

- Windows: `.exe`
- macOS: `.dmg`
- Linux: `.AppImage`

## 2) Deploy the download service on Render

1. Create a new Web Service from this repo.
2. Render will detect `render.yaml`.
3. Keep the generated `UPLOAD_TOKEN` env var.
4. Wait for deploy success.

Base URL example:

- `https://sam-code.onrender.com`

## 3) Upload files to Render

PowerShell examples:

```powershell
$TOKEN = "YOUR_UPLOAD_TOKEN"
$BASE = "https://sam-code.onrender.com"

curl.exe -X POST "$BASE/upload?token=$TOKEN" -F "file=@dist/sam-code-1.0.0-setup.exe" -F "filename=sam-code-1.0.0-setup.exe"
curl.exe -X POST "$BASE/upload?token=$TOKEN" -F "file=@path/to/sam-code-1.0.0.dmg" -F "filename=sam-code-1.0.0.dmg"
curl.exe -X POST "$BASE/upload?token=$TOKEN" -F "file=@path/to/sam-code-1.0.0.AppImage" -F "filename=sam-code-1.0.0.AppImage"
```

Check files:

```powershell
curl.exe "$BASE/files"
```

## 4) Final download URLs

- `https://sam-code.onrender.com/download/sam-code-1.0.0-setup.exe`
- `https://sam-code.onrender.com/download/sam-code-1.0.0.dmg`
- `https://sam-code.onrender.com/download/sam-code-1.0.0.AppImage`

## 5) Landing page

Landing page already points to those 3 URLs in `marketplace/index.html`.

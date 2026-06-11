# SamCode Marketplace

This folder is the local workspace for SamCode marketplace content.

## Package groups

- `python-notebook-core` for notebook execution and rich cell output
- `pandas-numpy` for the core pandas and NumPy analysis stack
- `data-science-pack` for the full notebook and data science bundle
- `live-server` for previewing HTML files with auto reload
- `pdf-viewer` for viewing PDF files inside the editor

## Layout

- `catalog.json` is the source catalog used by the UI
- `packages/` contains installable package manifests
- `plugins/` contains editor and workflow plugins

The UI reads from an online catalog and installs packages lazily so the editor bundle stays light.

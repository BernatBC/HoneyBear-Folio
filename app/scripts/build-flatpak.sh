#!/bin/bash
set -e

# Arguments
TARGET_TRIPLE=$1

# Base path relative to the manifest file (app/flatpak/flatpak-build.yml)
# The manifest is in app/flatpak, so .. goes to app.
# We need to go to app/src-tauri/target/...
# So ../src-tauri/target/... is correct.

if [ -z "$TARGET_TRIPLE" ]; then
  BINARY_REL_PATH="../src-tauri/target/release/HoneyBear-Folio"
else
  BINARY_REL_PATH="../src-tauri/target/$TARGET_TRIPLE/release/HoneyBear-Folio"
fi

echo "Targeting binary at $BINARY_REL_PATH (relative to manifest)"

# Verify binary exists (relative to CWD which is repo root)
# Manifest is at app/flatpak/
# So path from root is app/flatpak/$BINARY_REL_PATH -> app/flatpak/../src-tauri -> app/src-tauri
CHECK_PATH="app/flatpak/$BINARY_REL_PATH"

if [ ! -f "$CHECK_PATH" ]; then
    echo "Error: Binary not found at $CHECK_PATH"
    echo "Current directory: $(pwd)"
    ls -R app/src-tauri/target || true
    exit 1
fi

# Create a temporary manifest with the correct path
cp app/flatpak/com.honeybearfolio.honeybearfolio.yml app/flatpak/flatpak-build.yml
# Escape slashes for sed
ESCAPED_PATH=$(echo "$BINARY_REL_PATH" | sed 's/\//\\\//g')
sed -i "s/path: ..\/src-tauri\/target\/release\/HoneyBear-Folio/path: $ESCAPED_PATH/g" app/flatpak/flatpak-build.yml

echo "Building Flatpak..."

# Build
mkdir -p build-dir
flatpak-builder --user --install-deps-from=flathub --force-clean --repo=repo build-dir app/flatpak/flatpak-build.yml

# Bundle
OUTPUT_NAME="honeybear-folio"
if [ -n "$TARGET_TRIPLE" ]; then
    OUTPUT_NAME="honeybear-folio-${TARGET_TRIPLE}"
fi

flatpak build-bundle repo ${OUTPUT_NAME}.flatpak com.honeybearfolio.honeybearfolio

echo "Flatpak built: ${OUTPUT_NAME}.flatpak"

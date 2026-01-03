use tempfile::tempdir;

#[test]
fn test_read_settings_invalid_json_should_error() {
    let dir = tempdir().unwrap();
    let dir_path = dir.path().to_path_buf();

    // Write invalid JSON to settings.json
    std::fs::write(dir_path.join("settings.json"), "not json").unwrap();

    let res = crate::read_settings_from_dir(&dir_path);
    assert!(res.is_err());
}

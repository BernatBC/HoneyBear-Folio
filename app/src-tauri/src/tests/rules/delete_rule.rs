use crate::tests::common::setup_db;
use crate::{create_rule_db, delete_rule_db, get_rules_db};

#[test]
fn test_delete_rule() {
    let (_dir, db_path) = setup_db();

    let id = create_rule_db(
        &db_path,
        10,
        "payee".to_string(),
        "Delete Me".to_string(),
        "category".to_string(),
        "N/A".to_string(),
    )
    .unwrap();

    let rules_before = get_rules_db(&db_path).unwrap();
    assert_eq!(rules_before.len(), 1);

    delete_rule_db(&db_path, id).expect("failed to delete rule");

    let rules_after = get_rules_db(&db_path).unwrap();
    assert_eq!(rules_after.len(), 0);
}

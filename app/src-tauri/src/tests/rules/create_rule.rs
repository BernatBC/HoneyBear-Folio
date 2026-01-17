use crate::tests::common::setup_db;
use crate::{create_rule_db, get_rules_db};

#[test]
fn test_create_and_get_rules() {
    let (_dir, db_path) = setup_db();

    // Create a rule
    let id = create_rule_db(
        &db_path,
        10,
        "payee".to_string(),
        "Starbucks".to_string(),
        "category".to_string(),
        "Coffee".to_string(),
    )
    .expect("failed to create rule");

    assert!(id > 0);

    // Verify fetching
    let rules = get_rules_db(&db_path).expect("failed to get rules");
    assert_eq!(rules.len(), 1);

    let rule = &rules[0];
    assert_eq!(rule.id, id);
    assert_eq!(rule.priority, 10);
    assert_eq!(rule.match_field, "payee");
    assert_eq!(rule.match_pattern, "Starbucks");
    assert_eq!(rule.action_field, "category");
    assert_eq!(rule.action_value, "Coffee");
}

//! Input length limits — keep in sync with src/lib/limits.ts

#![allow(dead_code)]

pub const SHORT_TEXT: usize = 128;
pub const MEDIUM_TEXT: usize = 512;
pub const LONG_TEXT: usize = 4000;
pub const ADDRESS: usize = 2000;
pub const NOTES: usize = 4000;
pub const DESCRIPTION: usize = 2000;
pub const PART_NUMBER: usize = 128;
pub const SA_NUMBER: usize = 64;
pub const UNIT: usize = 32;
pub const INVOICE_NUMBER: usize = 64;
pub const PO_NUMBER: usize = 64;
pub const NAME: usize = 128;
pub const MAX_LINE_ITEMS: usize = 500;
pub const MAX_PACKING_ROWS: usize = 500;

pub fn check_max(field: &str, value: &str, max: usize) -> Result<(), String> {
    if value.chars().count() > max {
        return Err(format!(
            "ERR_VALIDATION: {field} exceeds maximum length of {max} characters"
        ));
    }
    Ok(())
}

pub fn check_max_len(field: &str, len: usize, max: usize) -> Result<(), String> {
    if len > max {
        return Err(format!(
            "ERR_VALIDATION: {field} count {len} exceeds maximum of {max}"
        ));
    }
    Ok(())
}

/// Validates invoice write payloads — mirrors src/lib/schemas.ts limits.
pub fn validate_invoice_payload(
    invoice_number: &str,
    notes: &str,
    consignee_name: &str,
    consignee_address: &str,
    item_count: usize,
    descriptions: &[String],
) -> Result<(), String> {
    check_max("invoice_number", invoice_number, INVOICE_NUMBER)?;
    check_max("notes", notes, NOTES)?;
    check_max("consignee_name", consignee_name, NAME)?;
    check_max("consignee_address", consignee_address, ADDRESS)?;
    check_max_len("items", item_count, MAX_LINE_ITEMS)?;
    for (i, d) in descriptions.iter().enumerate() {
        check_max(&format!("items[{i}].description"), d, DESCRIPTION)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_rejects_oversize_notes() {
        let big = "x".repeat(NOTES + 1);
        let err = validate_invoice_payload("EXP/1/2025-26", &big, "A", "B", 1, &["ok".into()])
            .unwrap_err();
        assert!(err.starts_with("ERR_VALIDATION"));
    }
}

//! Plain-text rendering of what D1 returned. Everything from the database is untrusted, so it is
//! stripped of control characters before it reaches the terminal.

use std::{collections::BTreeMap, fmt::Write};

use crate::ids::printable;
use crate::store::{ReportCount, SubmissionRow};

const SECONDS_PER_DAY: i64 = 86_400;

/// `2027-01-15 08:00 UTC`.
pub fn format_utc(seconds: i64) -> String {
    let days = seconds.div_euclid(SECONDS_PER_DAY);
    let minutes = seconds.rem_euclid(SECONDS_PER_DAY) / 60;
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02} UTC",
        minutes / 60,
        minutes % 60
    )
}

pub fn pending_list(rows: &[SubmissionRow]) -> String {
    if rows.is_empty() {
        return "No pending submissions.\n".to_owned();
    }
    let mut text = String::new();
    for row in rows {
        let _ = writeln!(
            text,
            "{}  {}  {}  {}",
            printable(&row.id),
            printable(&row.recipe_id),
            printable(&row.version),
            format_utc(row.submitted_at)
        );
    }
    text
}

pub fn report_list(counts: &[ReportCount]) -> String {
    if counts.is_empty() {
        return "No reports.\n".to_owned();
    }
    let mut by_recipe: BTreeMap<&str, Vec<&ReportCount>> = BTreeMap::new();
    for count in counts {
        by_recipe.entry(&count.recipe_id).or_default().push(count);
    }
    let mut text = String::new();
    for (recipe_id, reasons) in by_recipe {
        let total: u64 = reasons.iter().map(|count| count.count).sum();
        let _ = writeln!(text, "{}  ({total} reports)", printable(recipe_id));
        for count in reasons {
            let _ = writeln!(
                text,
                "    {:<12} {:>5}  latest {}",
                printable(&count.reason),
                count.count,
                format_utc(count.latest)
            );
        }
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unix_seconds_become_utc_dates() {
        assert_eq!(format_utc(0), "1970-01-01 00:00 UTC");
        assert_eq!(format_utc(1_800_000_000), "2027-01-15 08:00 UTC");
        assert_eq!(format_utc(951_782_400), "2000-02-29 00:00 UTC");
    }

    #[test]
    fn reports_group_by_recipe_with_totals() {
        let report = |recipe: &str, reason: &str, count| ReportCount {
            recipe_id: recipe.into(),
            reason: reason.into(),
            count,
            latest: 0,
        };
        let text = report_list(&[
            report("market.b", "spam", 1),
            report("market.a", "harmful", 3),
            report("market.a", "broken", 2),
        ]);
        let a = text.find("market.a  (5 reports)").unwrap();
        let b = text.find("market.b  (1 reports)").unwrap();
        assert!(a < b, "{text}");
        assert!(text.contains("harmful"));
        assert_eq!(report_list(&[]), "No reports.\n");
    }

    #[test]
    fn hostile_database_text_cannot_inject_escapes() {
        let row = SubmissionRow {
            id: "a\u{1b}[2J".into(),
            recipe_id: "market.x".into(),
            version: "1.0.0".into(),
            status: "pending".into(),
            submitted_at: 0,
        };
        assert!(!pending_list(&[row]).contains('\u{1b}'));
    }
}

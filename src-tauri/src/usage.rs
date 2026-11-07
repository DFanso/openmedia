use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::library::write_atomically;

const FORMAT_VERSION: u32 = 1;
/// Days of history kept on disk, counting today.
pub const RETAINED_DAYS: u32 = 30;
const MAX_HOSTS_PER_DAY: usize = 200;
const MAX_SECTIONS_PER_HOST: usize = 60;
/// One flush never covers more than this; the shell flushes every few seconds.
pub const MAX_SECONDS_PER_RECORD: u32 = 3600;
const MAX_HOST_CHARS: usize = 253;
const MAX_SECTION_CHARS: usize = 24;
/// The section of a page at the root of its site.
pub const HOME_SECTION: &str = "/";
/// The section of every page whose first path segment is not a plain lowercase word.
pub const OTHER_SECTION: &str = "*";

type Sections = BTreeMap<String, u64>;
type Hosts = BTreeMap<String, Sections>;

#[derive(Debug, Serialize, Deserialize)]
struct UsageData {
    version: u32,
    /// Local date `YYYY-MM-DD` -> host -> section -> seconds.
    days: BTreeMap<String, Hosts>,
}

impl UsageData {
    fn empty() -> Self {
        Self {
            version: FORMAT_VERSION,
            days: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionUsage {
    pub section: String,
    pub seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteUsage {
    pub host: String,
    /// The bundled recipe's name for the site, when one covers it; filled in by the command.
    pub name: Option<String>,
    pub seconds: u64,
    pub sections: Vec<SectionUsage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    pub total_seconds: u64,
    /// Busiest site first.
    pub sites: Vec<SiteUsage>,
}

/// Seconds spent per site and per area of the site, per local day. Holds only host names, the
/// first path segment and counts: never a full address, query or title. Kept in its own file so
/// the library stays small, and it never leaves the device.
pub struct Usage {
    path: PathBuf,
    data: Mutex<UsageData>,
}

impl Usage {
    /// A missing, corrupt or newer-format file starts empty: these numbers are disposable.
    pub fn load(path: PathBuf) -> Result<Self> {
        let data = match fs::read_to_string(&path) {
            Ok(text) => parse(&text),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => UsageData::empty(),
            Err(e) => return Err(e.into()),
        };
        Ok(Self {
            path,
            data: Mutex::new(data),
        })
    }

    /// Adds `seconds` to a site section for `day`, then drops days older than the retention
    /// window counted back from the newest recorded day. Sites or sections beyond the per-day caps are not recorded.
    pub fn record(&self, day: &str, host: &str, section: &str, seconds: u32) -> Result<()> {
        let today = day_number(day).ok_or(Error::InvalidUsage("the day must be YYYY-MM-DD"))?;
        if !valid_host(host) {
            return Err(Error::InvalidUsage("invalid host"));
        }
        if !valid_section(section) {
            return Err(Error::InvalidUsage("invalid section"));
        }
        if seconds == 0 || seconds > MAX_SECONDS_PER_RECORD {
            return Err(Error::InvalidUsage("seconds out of range"));
        }
        let mut data = self.lock()?;
        let hosts = data.days.entry(day.to_owned()).or_default();
        if hosts.contains_key(host) || hosts.len() < MAX_HOSTS_PER_DAY {
            let sections = hosts.entry(host.to_owned()).or_default();
            if sections.contains_key(section) || sections.len() < MAX_SECTIONS_PER_HOST {
                let total = sections.entry(section.to_owned()).or_default();
                *total = total.saturating_add(u64::from(seconds));
            }
        }
        let newest = data
            .days
            .keys()
            .filter_map(|key| day_number(key))
            .max()
            .unwrap_or(today);
        data.days.retain(|key, _| {
            day_number(key).is_some_and(|number| number > newest - i64::from(RETAINED_DAYS))
        });
        self.save(&data)
    }

    /// Totals for the `days` days ending at `today`, today included.
    pub fn report(&self, today: &str, days: u32) -> Result<UsageReport> {
        let end = day_number(today).ok_or(Error::InvalidUsage("the day must be YYYY-MM-DD"))?;
        let start = end - i64::from(days.clamp(1, RETAINED_DAYS)) + 1;
        let data = self.lock()?;
        let mut merged = Hosts::new();
        for (key, hosts) in &data.days {
            if !day_number(key).is_some_and(|number| (start..=end).contains(&number)) {
                continue;
            }
            for (host, sections) in hosts {
                let target = merged.entry(host.clone()).or_default();
                for (section, seconds) in sections {
                    let total = target.entry(section.clone()).or_default();
                    *total = total.saturating_add(*seconds);
                }
            }
        }
        Ok(summarize(merged))
    }

    pub fn clear(&self) -> Result<()> {
        let mut data = self.lock()?;
        *data = UsageData::empty();
        self.save(&data)
    }

    fn lock(&self) -> Result<MutexGuard<'_, UsageData>> {
        self.data.lock().map_err(|_| Error::Poisoned)
    }

    fn save(&self, data: &UsageData) -> Result<()> {
        write_atomically(&self.path, &serde_json::to_vec(data)?)?;
        Ok(())
    }
}

fn parse(text: &str) -> UsageData {
    match serde_json::from_str::<UsageData>(text) {
        Ok(data) if data.version == FORMAT_VERSION => data,
        _ => UsageData::empty(),
    }
}

fn summarize(merged: Hosts) -> UsageReport {
    let mut sites: Vec<SiteUsage> = merged
        .into_iter()
        .map(|(host, sections)| {
            let mut sections: Vec<SectionUsage> = sections
                .into_iter()
                .map(|(section, seconds)| SectionUsage { section, seconds })
                .collect();
            sections.sort_by(|a, b| b.seconds.cmp(&a.seconds).then(a.section.cmp(&b.section)));
            SiteUsage {
                host,
                name: None,
                seconds: sections.iter().map(|s| s.seconds).sum(),
                sections,
            }
        })
        .collect();
    sites.sort_by(|a, b| b.seconds.cmp(&a.seconds).then(a.host.cmp(&b.host)));
    UsageReport {
        total_seconds: sites.iter().map(|site| site.seconds).sum(),
        sites,
    }
}

fn valid_host(host: &str) -> bool {
    !host.is_empty()
        && host.len() <= MAX_HOST_CHARS
        && !host.starts_with(['.', '-'])
        && !host.ends_with(['.', '-'])
        && host
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
}

fn valid_section(section: &str) -> bool {
    if section == HOME_SECTION || section == OTHER_SECTION {
        return true;
    }
    section.strip_prefix('/').is_some_and(|segment| {
        (1..=MAX_SECTION_CHARS).contains(&segment.len())
            && segment
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-')
    })
}

/// Days since 1970-01-01 for a `YYYY-MM-DD` date, or `None` when it is not a real date.
fn day_number(day: &str) -> Option<i64> {
    let bytes = day.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    let digits = |range: std::ops::Range<usize>| -> Option<i64> {
        let part = day.get(range)?;
        part.bytes()
            .all(|b| b.is_ascii_digit())
            .then(|| part.parse().ok())?
    };
    let (year, month, date) = (digits(0..4)?, digits(5..7)?, digits(8..10)?);
    if !(1970..=9999).contains(&year) || !(1..=12).contains(&month) {
        return None;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let length = match month {
        2 if leap => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    if !(1..=length).contains(&date) {
        return None;
    }
    let shifted_year = if month <= 2 { year - 1 } else { year };
    let era = shifted_year / 400;
    let year_of_era = shifted_year - era * 400;
    let day_of_year = (153 * ((month + 9) % 12) + 2) / 5 + date - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    Some(era * 146_097 + day_of_era - 719_468)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usage() -> (tempfile::TempDir, Usage) {
        let dir = tempfile::tempdir().unwrap();
        let usage = Usage::load(dir.path().join("usage.json")).unwrap();
        (dir, usage)
    }

    fn reload(dir: &tempfile::TempDir) -> Usage {
        Usage::load(dir.path().join("usage.json")).unwrap()
    }

    #[test]
    fn day_numbers_count_real_calendar_days() {
        assert_eq!(day_number("1970-01-01"), Some(0));
        assert_eq!(
            day_number("2024-03-01"),
            day_number("2024-02-29").map(|n| n + 1)
        );
        assert_eq!(
            day_number("2025-03-01"),
            day_number("2025-02-28").map(|n| n + 1)
        );
        assert_eq!(
            day_number("2026-01-01"),
            day_number("2025-12-31").map(|n| n + 1)
        );
    }

    #[test]
    fn day_numbers_reject_malformed_dates() {
        for bad in [
            "",
            "2025-1-01",
            "2025-13-01",
            "2025-02-29",
            "2025-04-31",
            "2025-00-10",
            "2025-01-00",
            "20250101",
            "2025/01/01",
            "abcd-ef-gh",
            "1969-12-31",
            "2025-01-0١",
            "+025-01-01",
        ] {
            assert_eq!(day_number(bad), None, "{bad}");
        }
    }

    #[test]
    fn records_accumulate_per_site_and_section() {
        let (_dir, usage) = usage();
        usage
            .record("2026-11-08", "youtube.com", "/watch", 30)
            .unwrap();
        usage
            .record("2026-11-08", "youtube.com", "/watch", 20)
            .unwrap();
        usage
            .record("2026-11-08", "youtube.com", "/shorts", 10)
            .unwrap();
        usage.record("2026-11-08", "reddit.com", "/", 5).unwrap();
        let report = usage.report("2026-11-08", 1).unwrap();
        assert_eq!(report.total_seconds, 65);
        assert_eq!(report.sites[0].host, "youtube.com");
        assert_eq!(report.sites[0].seconds, 60);
        assert_eq!(
            report.sites[0].sections,
            vec![
                SectionUsage {
                    section: "/watch".into(),
                    seconds: 50
                },
                SectionUsage {
                    section: "/shorts".into(),
                    seconds: 10
                },
            ]
        );
        assert_eq!(report.sites[1].host, "reddit.com");
    }

    #[test]
    fn reports_cover_only_the_requested_window() {
        let (_dir, usage) = usage();
        usage.record("2026-11-08", "a.com", "/", 1).unwrap();
        usage.record("2026-11-02", "a.com", "/", 10).unwrap();
        usage.record("2026-10-20", "a.com", "/", 100).unwrap();
        assert_eq!(usage.report("2026-11-08", 1).unwrap().total_seconds, 1);
        assert_eq!(usage.report("2026-11-08", 7).unwrap().total_seconds, 11);
        assert_eq!(usage.report("2026-11-08", 30).unwrap().total_seconds, 111);
        assert_eq!(usage.report("2026-11-08", 999).unwrap().total_seconds, 111);
    }

    #[test]
    fn days_older_than_the_retention_window_are_pruned() {
        let (dir, usage) = usage();
        usage.record("2026-10-01", "a.com", "/", 5).unwrap();
        usage.record("2026-10-10", "a.com", "/", 5).unwrap();
        usage.record("2026-11-08", "a.com", "/", 5).unwrap();
        let reloaded = reload(&dir);
        assert_eq!(reloaded.report("2026-10-10", 30).unwrap().total_seconds, 5);
        assert_eq!(reloaded.report("2026-11-08", 30).unwrap().total_seconds, 10);
    }

    #[test]
    fn records_survive_a_reload_and_clear_wipes_them() {
        let (dir, usage) = usage();
        usage.record("2026-11-08", "a.com", "/x", 5).unwrap();
        assert_eq!(
            reload(&dir).report("2026-11-08", 7).unwrap().total_seconds,
            5
        );
        usage.clear().unwrap();
        let report = reload(&dir).report("2026-11-08", 30).unwrap();
        assert_eq!(report.total_seconds, 0);
        assert!(report.sites.is_empty());
    }

    #[test]
    fn rejects_untrusted_input() {
        let (_dir, usage) = usage();
        let cases = [
            ("2026-11-08", "https://a.com/x", "/", 5),
            ("2026-11-08", "A.com", "/", 5),
            ("2026-11-08", "", "/", 5),
            ("2026-11-08", "a.com/path", "/", 5),
            ("2026-11-08", "a.com", "/@user", 5),
            ("2026-11-08", "a.com", "watch", 5),
            ("2026-11-08", "a.com", "/Watch", 5),
            ("2026-11-08", "a.com", "/with space", 5),
            ("2026-11-08", "a.com", "/ünï", 5),
            ("2026-11-08", "a.com", "/", 0),
            ("2026-11-08", "a.com", "/", MAX_SECONDS_PER_RECORD + 1),
            ("yesterday", "a.com", "/", 5),
        ];
        for (day, host, section, seconds) in cases {
            assert!(
                matches!(
                    usage.record(day, host, section, seconds),
                    Err(Error::InvalidUsage(_))
                ),
                "{day} {host} {section} {seconds}"
            );
        }
        assert!(
            usage
                .record("2026-11-08", "a.com", &format!("/{}", "a".repeat(25)), 5)
                .is_err()
        );
        assert!(
            usage
                .record("2026-11-08", "a.com", &format!("/{}", "a".repeat(24)), 5)
                .is_ok()
        );
        assert!(
            usage
                .record("2026-11-08", "a.com", OTHER_SECTION, 5)
                .is_ok()
        );
        assert_eq!(usage.report("2026-11-08", 1).unwrap().sites.len(), 1);
    }

    #[test]
    fn caps_hosts_and_sections_per_day() {
        let (_dir, usage) = usage();
        for i in 0..MAX_SECTIONS_PER_HOST + 5 {
            usage
                .record("2026-11-08", "a.com", &format!("/s{i}"), 1)
                .unwrap();
        }
        for i in 0..MAX_HOSTS_PER_DAY + 5 {
            usage
                .record("2026-11-08", &format!("h{i}.com"), "/", 1)
                .unwrap();
        }
        usage.record("2026-11-08", "a.com", "/s0", 1).unwrap();
        let report = usage.report("2026-11-08", 1).unwrap();
        assert_eq!(report.sites.len(), MAX_HOSTS_PER_DAY);
        let a = report.sites.iter().find(|s| s.host == "a.com").unwrap();
        assert_eq!(a.sections.len(), MAX_SECTIONS_PER_HOST);
        assert_eq!(
            a.sections
                .iter()
                .find(|s| s.section == "/s0")
                .unwrap()
                .seconds,
            2
        );
    }

    #[test]
    fn a_corrupt_or_newer_file_starts_empty() {
        for text in ["not json", r#"{"version":99,"days":{}}"#] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("usage.json");
            fs::write(&path, text).unwrap();
            let usage = Usage::load(path).unwrap();
            assert_eq!(usage.report("2026-11-08", 30).unwrap().total_seconds, 0);
        }
    }

    #[test]
    fn the_file_holds_only_names_and_seconds() {
        let (dir, usage) = usage();
        usage
            .record("2026-11-08", "youtube.com", "/watch", 7)
            .unwrap();
        let text = fs::read_to_string(dir.path().join("usage.json")).unwrap();
        assert_eq!(
            text,
            r#"{"version":1,"days":{"2026-11-08":{"youtube.com":{"/watch":7}}}}"#
        );
    }
}

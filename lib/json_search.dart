/// Local, case-insensitive search over JSON keys and string values.
///
/// An entry matches when its key, its string value, a string in its array,
/// or any nested key/value matches. Container ancestors remain visible so
/// matches are never shown without their hierarchy.
class JsonSearch {
  const JsonSearch._();

  static String normalize(String term) => term.trim().toLowerCase();

  static bool keyMatches(String key, String term) =>
      key.toLowerCase().contains(normalize(term));

  static bool valueMatches(Object? value, String term) {
    final needle = normalize(term);
    if (needle.isEmpty) return true;
    if (value is String) return value.toLowerCase().contains(needle);
    if (value is List) {
      return value.any((item) => valueMatches(item, needle));
    }
    if (value is Map<String, dynamic>) {
      return value.entries.any(
        (entry) => matches(entry.key, entry.value, needle),
      );
    }
    return false;
  }

  static bool matches(String key, Object? value, String term) {
    final needle = normalize(term);
    return needle.isEmpty ||
        keyMatches(key, needle) ||
        valueMatches(value, needle);
  }
}

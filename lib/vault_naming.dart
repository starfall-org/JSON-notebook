/// Keep file formats explicit: changing the extension is not a conversion.
String validateEntryName(
  String name, {
  String? originalName,
  bool folder = false,
}) {
  final value = name.trim();
  if (value.isEmpty ||
      value == '.' ||
      value == '..' ||
      value.contains('/') ||
      value.contains('\\') ||
      value.runes.any((rune) => rune < 32)) {
    throw const FormatException('Invalid file or folder name');
  }
  if (!folder && originalName != null) {
    final originalExtension = originalName.toLowerCase().endsWith('.json')
        ? '.json'
        : '.md';
    if (!value.toLowerCase().endsWith(originalExtension)) {
      throw FormatException(
        'Keep $originalExtension when renaming; use Convert/Export to change file format',
      );
    }
  }
  return value;
}

void ensureUniqueName(
  Iterable<String> siblings,
  String requested, {
  String? excluding,
}) {
  if (siblings.any(
    (item) =>
        item.toLowerCase() == requested.toLowerCase() &&
        item.toLowerCase() != excluding?.toLowerCase(),
  )) {
    throw FormatException('A file or folder named "$requested" already exists');
  }
}

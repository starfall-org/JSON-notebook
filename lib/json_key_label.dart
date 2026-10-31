import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Displays Markdown HTTP(S) links inside a JSON key without changing the key.
/// For example, `[Docs](https://example.com)` renders as a tappable "Docs",
/// but the original string remains the key used for editing and persistence.
class JsonKeyLabel extends StatefulWidget {
  const JsonKeyLabel({
    super.key,
    required this.rawKey,
    this.style,
    this.openLink,
  });

  final String rawKey;
  final TextStyle? style;

  /// Injectable for widget tests; production opens HTTP(S) links externally.
  final Future<bool> Function(Uri uri)? openLink;

  @override
  State<JsonKeyLabel> createState() => _JsonKeyLabelState();
}

class _JsonKeyLabelState extends State<JsonKeyLabel> {
  static final _link = RegExp(
    r'\[([^\]]+)\]\((https?://[^\s)]+)\)',
    caseSensitive: false,
  );
  final _recognizers = <TapGestureRecognizer>[];
  final _parts = <InlineSpan>[];

  @override
  void initState() {
    super.initState();
    _parse();
  }

  @override
  void didUpdateWidget(covariant JsonKeyLabel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.rawKey != widget.rawKey) _parse();
  }

  void _parse() {
    for (final recognizer in _recognizers) {
      recognizer.dispose();
    }
    _recognizers.clear();
    _parts.clear();
    var from = 0;
    for (final match in _link.allMatches(widget.rawKey)) {
      final uri = Uri.tryParse(match.group(2)!);
      if (uri == null ||
          !uri.hasAuthority ||
          (uri.scheme != 'https' && uri.scheme != 'http')) {
        continue;
      }
      if (match.start > from) {
        _parts.add(TextSpan(text: widget.rawKey.substring(from, match.start)));
      }
      final recognizer = TapGestureRecognizer()
        ..onTap = () async {
          try {
            final opened =
                await (widget.openLink?.call(uri) ??
                    launchUrl(uri, mode: LaunchMode.externalApplication));
            if (!opened && mounted) {
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(const SnackBar(content: Text('Cannot open link')));
            }
          } catch (_) {
            if (mounted) {
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(const SnackBar(content: Text('Cannot open link')));
            }
          }
        };
      _recognizers.add(recognizer);
      _parts.add(
        TextSpan(
          text: match.group(1)!,
          recognizer: recognizer,
          style: const TextStyle(decoration: TextDecoration.underline),
        ),
      );
      from = match.end;
    }
    if (from < widget.rawKey.length) {
      _parts.add(TextSpan(text: widget.rawKey.substring(from)));
    }
  }

  @override
  void dispose() {
    for (final recognizer in _recognizers) {
      recognizer.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text.rich(
      TextSpan(
        children: [
          for (final part in _parts)
            if (part is TextSpan && part.recognizer != null)
              TextSpan(
                text: part.text,
                recognizer: part.recognizer,
                style: TextStyle(
                  color: theme.colorScheme.primary,
                  decoration: TextDecoration.underline,
                ),
              )
            else
              part,
        ],
      ),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: widget.style ?? theme.textTheme.titleSmall,
    );
  }
}

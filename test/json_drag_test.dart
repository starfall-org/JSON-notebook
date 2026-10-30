import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/json_document.dart';

void main() {
  test('Reorder root keys both before and after without changing values', () {
    final original = JsonDocument.parse(
      '{"Alpha":"one","Beta":["two","three"],"Gamma":{"Nested":"four"}}',
    );
    final toFirst = original.moveKey(
      ['Gamma'],
      ['Alpha'],
      JsonDropPosition.before,
    );
    expect(toFirst.data.keys.toList(), ['Gamma', 'Alpha', 'Beta']);
    expect(toFirst.at(['Gamma', 'Nested']), 'four');
    expect(toFirst.at(['Beta']), ['two', 'three']);
    final toLast = toFirst.moveKey(['Gamma'], ['Beta'], JsonDropPosition.after);
    expect(toLast.data.keys.toList(), ['Alpha', 'Beta', 'Gamma']);
    expect(JsonDocument.parse(toLast.toJson()).data, original.data);
    expect(original.data.keys.toList(), ['Alpha', 'Beta', 'Gamma']);
  });

  test('Reorder nested sibling without affecting other branches', () {
    final document = JsonDocument.parse(
      '{"Parent":{"One":"1","Two":"2","Three":"3"},"Other":"safe"}',
    );
    final moved = document.moveKey(
      ['Parent', 'Three'],
      ['Parent', 'One'],
      JsonDropPosition.before,
    );
    expect((moved.at(['Parent']) as Map).keys.toList(), [
      'Three',
      'One',
      'Two',
    ]);
    expect(moved.at(['Other']), 'safe');
  });

  test('Move a full subtree across parents and preserve leaf arrays', () {
    final doc = JsonDocument.parse(
      '{"A":{"Group":{"Token":["e","f"],"Child":"a"}},"B":{"Keep":"yes"}}',
    );
    final moved = doc.moveKey(['A', 'Group'], ['B'], JsonDropPosition.inside);
    expect(moved.data, {
      'A': <String, dynamic>{},
      'B': {
        'Keep': 'yes',
        'Group': {
          'Token': ['e', 'f'],
          'Child': 'a',
        },
      },
    });
    expect(doc.at(['A', 'Group', 'Token']), ['e', 'f']);
    expect(JsonDocument.parse(moved.toJson()).data, moved.data);
  });

  test('Drop inside an empty string promotes it to a container', () {
    final doc = JsonDocument.parse('{"Value":"secret","Empty":""}');
    final moved = doc.moveKey(['Value'], ['Empty'], JsonDropPosition.inside);
    expect(moved.data, {
      'Empty': {'Value': 'secret'},
    });
  });

  test('Before/after insertion moves across parent objects', () {
    final doc = JsonDocument.parse(
      '{"A":{"First":"a","Second":"b"},"B":{"Early":"x","Late":"y"}}',
    );
    final moved = doc.moveKey(
      ['A', 'Second'],
      ['B', 'Late'],
      JsonDropPosition.before,
    );
    expect((moved.at(['A']) as Map).keys.toList(), ['First']);
    expect((moved.at(['B']) as Map).keys.toList(), ['Early', 'Second', 'Late']);
    expect(moved.at(['B', 'Second']), 'b');
  });

  test(
    'Reject self, descendant, collisions, populated targets and list items',
    () {
      final doc = JsonDocument.parse(
        '{"A":{"Group":{"Key":"value"},"Duplicate":"source"},"B":{"Duplicate":"existing"},"Populated":"text","Array":["x","y"]}',
      );
      final invalid =
          <({List<Object> source, List<Object> target, JsonDropPosition mode})>[
            (source: ['A'], target: ['A'], mode: JsonDropPosition.inside),
            (
              source: ['A'],
              target: ['A', 'Group'],
              mode: JsonDropPosition.inside,
            ),
            (
              source: ['A', 'Duplicate'],
              target: ['B'],
              mode: JsonDropPosition.inside,
            ),
            (
              source: ['A', 'Group'],
              target: ['Populated'],
              mode: JsonDropPosition.inside,
            ),
            (
              source: ['A', 'Group'],
              target: ['Array'],
              mode: JsonDropPosition.inside,
            ),
            (
              source: ['Array', 0],
              target: ['A'],
              mode: JsonDropPosition.inside,
            ),
            (source: ['Absent'], target: ['B'], mode: JsonDropPosition.inside),
          ];
      for (final attempt in invalid) {
        expect(
          doc.canMoveKey(attempt.source, attempt.target, attempt.mode),
          isFalse,
        );
        expect(
          () => doc.moveKey(attempt.source, attempt.target, attempt.mode),
          throwsFormatException,
        );
      }
      expect(doc.at(['A', 'Group', 'Key']), 'value');
      expect(doc.at(['B', 'Duplicate']), 'existing');
    },
  );

  test('Reordering to current location is a no-op', () {
    final doc = JsonDocument.parse('{"A":"a","B":"b","C":"c"}');
    final unchanged = doc.moveKey(['B'], ['C'], JsonDropPosition.before);
    expect(unchanged.toJson(), doc.toJson());
  });
}

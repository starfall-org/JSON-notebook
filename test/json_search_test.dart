import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/json_search.dart';

void main() {
  test('Searches nested keys and array string values case-insensitively', () {
    const data = <String, Object>{
      'Cloud': <String, Object>{
        'Production': <String, Object>{
          'Secrets': <String>['Api-Key', 'Other'],
        },
        'Hidden': 'unrelated',
      },
    };
    expect(JsonSearch.matches('Cloud', data['Cloud'], ' API-key '), isTrue);
    expect(JsonSearch.matches('Cloud', data['Cloud'], 'PRODUCTION'), isTrue);
    expect(JsonSearch.matches('Cloud', data['Cloud'], 'secrets'), isTrue);
    expect(JsonSearch.matches('Cloud', data['Cloud'], 'unrelated'), isTrue);
    expect(JsonSearch.matches('Cloud', data['Cloud'], 'absent'), isFalse);
  });

  test('Matches only the intended branch and handles empty query', () {
    const sections = <String, Object>{
      'Alpha': <String, String>{'Key': 'secret'},
      'Beta': <String, String>{'Other': 'ordinary'},
    };
    final filtered = sections.entries
        .where(
          (entry) => JsonSearch.matches(entry.key, entry.value, ' SeCreT '),
        )
        .toList();
    expect(filtered.map((entry) => entry.key), ['Alpha']);
    expect(JsonSearch.matches('Beta', sections['Beta'], ''), isTrue);
  });
}

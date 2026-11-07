import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:json_notebook/vault_store.dart';

void main() {
  test(
    'Google Drive uses the Google OAuth access token, not Firebase ID token',
    () async {
      final observedTokens = <String?>[];
      final store = GoogleDriveStore(
        accessToken: () async => 'google-oauth-token',
        client: MockClient((request) async {
          observedTokens.add(request.headers['Authorization']);
          return http.Response(
            '{"files":[{"id":"existing","name":"secrets",'
            '"mimeType":"application/vnd.google-apps.folder"}]}',
            200,
          );
        }),
      );

      expect((await store.root()).id, 'existing');
      expect(observedTokens, ['Bearer google-oauth-token']);
    },
  );

  test(
    'Expired Drive authorization requires an explicit reconnect on web',
    () async {
      var requests = 0;
      final store = GoogleDriveStore(
        accessToken: () async => 'expired-google-token',
        client: MockClient((request) async {
          requests++;
          return http.Response('Unauthorized', 401);
        }),
      );

      await expectLater(
        store.root(),
        throwsA(isA<DriveAuthorizationExpired>()),
      );
      expect(requests, 1);
    },
  );

  test('Native Drive store can renew a token once after 401', () async {
    var token = 'expired-google-token';
    var renewals = 0;
    final observedTokens = <String?>[];
    final store = GoogleDriveStore(
      accessToken: () async => token,
      onUnauthorized: () async {
        renewals++;
        token = 'fresh-google-token';
        return true;
      },
      client: MockClient((request) async {
        observedTokens.add(request.headers['Authorization']);
        if (request.headers['Authorization'] == 'Bearer expired-google-token') {
          return http.Response('Unauthorized', 401);
        }
        return http.Response(
          '{"files":[{"id":"existing","name":"secrets",'
          '"mimeType":"application/vnd.google-apps.folder"}]}',
          200,
        );
      }),
    );

    expect((await store.root()).id, 'existing');
    expect(renewals, 1);
    expect(observedTokens, [
      'Bearer expired-google-token',
      'Bearer fresh-google-token',
    ]);
  });

  test(
    'Missing Drive OAuth access token never sends an HTTP request',
    () async {
      var requests = 0;
      final store = GoogleDriveStore(
        accessToken: () async => null,
        client: MockClient((request) async {
          requests++;
          return http.Response('', 200);
        }),
      );
      await expectLater(
        store.root(),
        throwsA(isA<DriveAuthorizationExpired>()),
      );
      expect(requests, 0);
    },
  );
}

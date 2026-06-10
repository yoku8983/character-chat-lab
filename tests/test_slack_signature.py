import hashlib
import hmac
import unittest

from app.slack.signature import verify_slack_signature


def _signature(secret: str, timestamp: str, body: str) -> str:
    base_string = f"v0:{timestamp}:{body}".encode()
    digest = hmac.new(secret.encode(), base_string, hashlib.sha256).hexdigest()
    return f"v0={digest}"


class SlackSignatureTest(unittest.TestCase):
    def test_valid_signature_is_accepted(self):
        secret = "test-secret"
        timestamp = "1710000000"
        body = '{"type":"event_callback"}'

        self.assertTrue(
            verify_slack_signature(
                signing_secret=secret,
                timestamp=timestamp,
                signature=_signature(secret, timestamp, body),
                body=body,
                now=lambda: 1710000000,
            )
        )

    def test_invalid_signature_is_rejected(self):
        self.assertFalse(
            verify_slack_signature(
                signing_secret="test-secret",
                timestamp="1710000000",
                signature="v0=invalid",
                body="{}",
                now=lambda: 1710000000,
            )
        )

    def test_old_timestamp_is_rejected(self):
        secret = "test-secret"
        timestamp = "1710000000"
        body = "{}"

        self.assertFalse(
            verify_slack_signature(
                signing_secret=secret,
                timestamp=timestamp,
                signature=_signature(secret, timestamp, body),
                body=body,
                now=lambda: 1710000301,
            )
        )


if __name__ == "__main__":
    unittest.main()

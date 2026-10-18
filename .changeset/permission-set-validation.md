---
"@svebcomponents/atproto.bridge": patch
---

Check the shape of each permission set at construction, since sets often come
from JSON: a malformed entry now fails with its name instead of a bare
TypeError. A set's `clientName` is limited to 100 characters.

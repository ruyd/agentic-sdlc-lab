# Frontend user testing script

Copy this file to the root of a member repo as `frontend-user-testing-script.md` and replace the examples. The
synthetic user review (`.claude/agents/usertest.md`) follows it on every frontend PR, in a browser, against the app
started by `frontendApp.start` in `context/review-routing.json`. It replaces the manual UI test pass.

Write it the way you would brief a careful new tester: exact actions, exact expected results, and only test data.

## Setup
- **Start page:** `/` (relative to `frontendApp.url`)
- **Viewports:** 1280x800 (desktop), 390x844 (phone)
- **Test data:** use only these values. Never real people, passwords or cards.
  - Test user: `test.user@example.test` / password `test-only-password`
  - Test card (if the app has payments in test mode): the provider's published test number

## Journeys
Mark a journey **critical** if a failure must block the PR.

### 1. Sign in (critical)
| Step | Action | Expected result |
|---|---|---|
| 1.1 | Open `/login` | A form with Email and Password fields and a "Sign in" button |
| 1.2 | Sign in with the test user | The dashboard loads within 2 seconds and shows "Welcome" |
| 1.3 | Press Tab from the top of the page | Focus moves visibly through the header links, then the main content |

### 2. Create an invoice (critical)
| Step | Action | Expected result |
|---|---|---|
| 2.1 | Click "New invoice" | An empty invoice form opens |
| 2.2 | Add a line: "Consulting", quantity 2, unit price 150.00 | Subtotal shows $300.00 |
| 2.3 | Click "Save" with the customer field empty | An error next to Customer says it is required; the line is kept |

### 3. Empty and error states
| Step | Action | Expected result |
|---|---|---|
| 3.1 | Open `/invoices?filter=none-match` | An empty state explains there are no invoices and offers "New invoice" |

## Screenshots to always take
- The dashboard after sign-in, at both viewports.

import * as usersRepo from "#features/users/repo.js"

export async function getUser(id) {
  return await usersRepo.getUser(id);
}

export async function getAllUsers() {
  return await usersRepo.getAllUsers();
}

export async function getAdminUsers() {
  return await usersRepo.getAdminUsers();
}

// THE MODES ARE AN ALLOWLIST, AND `amount` HAS TO BE A NUMBER.
//
// The repo builds the new balance with a CASE that has no ELSE:
//
//   SET dorado_funds = CASE WHEN $2 = 'add' ... WHEN $2 = 'subtract' ...
//                           WHEN $2 = 'edit' ... END
//
// A CASE that matches nothing yields NULL, so before this an unrecognised mode
// assigned NULL to a customer's credit balance. `mode` comes straight from
// req.body, so a typo, a renamed frontend constant or a stale client was enough.
//
// It never actually lost anyone's money, and it is worth being precise about
// why: exchange.users.dorado_funds is NOT NULL, so the database refused the
// write. THE CONSTRAINT WAS DOING THIS JOB, not the code - and auth.users,
// where this write goes after promotion, had no such constraint. Migration 080
// adds it, so the guarantee survives. This is the half that does not depend on
// a constraint existing at all.
//
// An allowlist rather than a check for known-bad values: the failure mode being
// prevented is an UNRECOGNISED mode, so a denylist could not have caught it.
const CREDIT_MODES = new Set(["add", "subtract", "edit"]);

// The same shape features/addresses uses: a plain Error carrying a statusCode.
// errorHandler treats a deliberate 4xx as safe to show the caller and returns a
// generic message for everything else, so the text here is written to be read.
function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

export async function adjustDoradoCredit({user_id, mode, amount}) {
  if (!CREDIT_MODES.has(mode)) {
    throw badRequest(
      `unknown credit mode ${JSON.stringify(mode)}. Expected one of ${[...CREDIT_MODES].join(", ")}.`
    );
  }

  // NOT `Number(amount)`. That was the first version of this check and it was
  // exactly the bug it was written to prevent: Number(null), Number("") and
  // Number([]) are all 0, and 0 is finite, so an empty amount field passed
  // validation and became a zero adjustment - under `edit`, a zeroed balance,
  // returned as 200. Caught by the suite below, which sends each of them.
  //
  // So the coercion is narrowed to the two things a caller can legitimately
  // send: a real number, or a non-empty string that parses to one. Everything
  // else is refused rather than coerced.
  const value =
    typeof amount === "number"
      ? amount
      : typeof amount === "string" && amount.trim() !== ""
        ? Number(amount)
        : NaN;
  if (!Number.isFinite(value)) {
    throw badRequest(`credit amount ${JSON.stringify(amount)} is not a number`);
  }

  if (!user_id) {
    throw badRequest("a credit adjustment needs a user_id");
  }

  return await usersRepo.adjustUserCredit(user_id, mode, value)
}

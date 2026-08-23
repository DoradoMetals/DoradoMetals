// Selects which schema the users feature reads.
//
//   USERS_SOURCE=exchange   (default) read exchange.users
//   USERS_SOURCE=dual                 read auth.users, writes unchanged
//
// This is the auth migration, or as much of it as can be done reversibly.
//
// better-auth owns exchange.users, exchange.session, exchange.account and
// exchange.verification, and writes all four through its own pool. That was
// read as "auth cannot be migrated", and for session, account and verification
// it still is - those move in one atomic cutover whenever that is decided, and
// the worst case is everyone being logged out.
//
// users is different, because our own code reads it: getUser, getAllUsers and
// getAdminUsers serve the admin screens and have nothing to do with
// better-auth. Those reads can move behind a switch like any other feature, so
// long as auth.users is kept honest - which migration 056 does with a trigger,
// below the level better-auth operates at.
//
// There is deliberately no `next`, for the usual reason: it would be a one-way
// door. There is also no dual *write*, because there is no write of ours to
// duplicate.
import * as exchange from "#features/users/repo.exchange.js";
import * as dual from "#features/users/repo.dual.js";

const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.USERS_SOURCE ?? "")
  ? process.env.USERS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getUser = impl.getUser;
export const getAllUsers = impl.getAllUsers;
export const getAdminUsers = impl.getAdminUsers;
export const adjustUserCredit = impl.adjustUserCredit;

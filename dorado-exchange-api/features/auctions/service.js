import * as auctionsRepo from "#features/auctions/repo.js";

export async function list() {
  return auctionsRepo.list();
}

export async function get({auction_id}) {
  return await auctionsRepo.getById(auction_id);
}

export async function create({ status, scheduled_date, user_id }) {
  return auctionsRepo.create({ status, scheduled_date, user_id });
}

export async function update({ auction_id, status, scheduled_date, user_id }) {
  return await auctionsRepo.update({
    auction_id,
    status,
    scheduled_date,
    user_id
  });
}

export async function remove({ auction_id }) {
  await auctionsRepo.remove(auction_id);
  return "Deleted auction.";
}

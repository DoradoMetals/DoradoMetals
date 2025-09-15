import * as addressRepo from '../repositories/addressRepo.js';

export async function getAddressFromId(id) {
  return await addressRepo.getAddressFromId(id);
}

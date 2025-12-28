import * as carriersRepo from "#features/shipping/carriers/repo.js"

export async function getAll(req, res, next) {
  try {
    const result = await carriersRepo.getAll();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

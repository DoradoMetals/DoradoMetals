import * as carriersService from "../services/carriersService.js";

export async function getAll(req, res, next) {
  try {
    const result = await carriersService.getAll();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

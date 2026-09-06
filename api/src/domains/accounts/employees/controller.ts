import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as employeeService from '#accounts/employees/service.ts'

export const listEmployees = asyncHandler(async (_req, res) => {
  return res.json(await employeeService.list())
})

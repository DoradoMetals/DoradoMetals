import { UsersService } from "@/features/auth/users/service";
import { controller } from "@/shared/http/controller";

export class UsersController {
  getUser = controller(UsersService, async ({ query, service }) => {
    return service.getUser(query);
  });

  getAll = controller(UsersService, async ({ service }) => {
    return service.getAllUsers();
  });

  getAdmins = controller(UsersService, async ({ service }) => {
    return service.getAdminUsers();
  });

  updateCredit = controller(UsersService, async ({ body, service }) => {
    return service.adjustDoradoCredit(body);
  });
}

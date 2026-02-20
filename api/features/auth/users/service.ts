import { UsersRepo } from "@/features/auth/users/repo";
import { AdjustUserCreditInput } from "@/features/auth/users/types";
import { EntityManager } from "@mikro-orm/postgresql";

export class UsersService {
  private repo: UsersRepo;

  constructor(em: EntityManager) {
    this.repo = new UsersRepo(em);
  }

  getUser(input: { user_id: string }) {
    return this.repo.getById(input);
  }

  getAllUsers() {
    return this.repo.getAll();
  }

  getAdminUsers() {
    return this.repo.getAdmins();
  }

  adjustDoradoCredit(input: AdjustUserCreditInput) {
    return this.repo.adjustCredit(input);
  }
}

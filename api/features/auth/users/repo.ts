import { EntityManager } from '@mikro-orm/postgresql';
import { User } from '@/db/entities/auth/users';
import { AdjustUserCreditInput } from '@/features/auth/users/types';

export class UsersRepo {
  constructor(private readonly em: EntityManager) {}

  getById(input: { user_id: string }) {
    return this.em.findOne(User, { id: input.user_id });
  }

  getAll() {
    return this.em.find(User, {}, { orderBy: { role: 'asc' } });
  }

  getAdmins() {
    return this.em.find(
      User,
      { role: 'admin' },
      { orderBy: { name: 'desc' } }
    );
  }

  async adjustCredit(input: AdjustUserCreditInput) {
    const user = await this.em.findOneOrFail(User, {
      id: input.user_id,
    });

    const current = Number(user.dorado_funds ?? 0);

    switch (input.mode) {
      case 'add':
        user.dorado_funds = current + input.amount;
        break;
      case 'subtract':
        user.dorado_funds = current - input.amount;
        break;
      case 'edit':
        user.dorado_funds = input.amount;
        break;
    }

    await this.em.flush();
    return user;
  }
}

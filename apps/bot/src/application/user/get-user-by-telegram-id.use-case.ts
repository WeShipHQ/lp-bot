import { container } from "@/infrastructure/di/container";
import { IUserRepository } from "@/domain/user/user.repository";
import { User } from "@/domain/user/user.entity";

export class GetUserByTelegramIdUseCase {
  async execute(telegramId: string): Promise<User | null> {
    const userRepository = container.get(IUserRepository);
    return await userRepository.findByTelegramId(telegramId);
  }
}
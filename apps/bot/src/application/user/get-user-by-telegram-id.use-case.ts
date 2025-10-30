// import { container, DI_TOKENS } from "@/infrastructure/di/container";
// import { IUserRepository } from "@/domain/user/user.repository";
// import { User } from "@/domain/user/user.entity";

// export class GetUserByTelegramIdUseCase {
//   async execute(telegramId: string): Promise<User | null> {
//     const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
//     // return await userRepository.findByTelegramId(telegramId);
//     return await userRepository.findById(telegramId);
//   }
// }

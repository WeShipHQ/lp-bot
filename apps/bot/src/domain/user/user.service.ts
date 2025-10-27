import { ValidationError } from "../shared/errors";
import type { CreateUserData } from "./types";
import { User } from "./user.entity";
import type { IUserRepository } from "./user.repository";

export class UserDomainService {
  constructor(private readonly userRepository: IUserRepository) {}

  async createUserWithReferral(
    userData: CreateUserData,
    referralCode?: string
  ): Promise<User> {
    const isWalletUnique = await this.validateUniqueWalletAddress(
      userData.walletAddress
    );

    if (!isWalletUnique) {
      throw new ValidationError(
        "Wallet address is already in use",
        "USER_WALLET_NOT_UNIQUE"
      );
    }

    const normalizedReferral = referralCode?.trim();

    const user = User.create({
      ...userData,
      referredBy: normalizedReferral ?? userData.referredBy,
    });

    await this.userRepository.save(user);

    return user;
  }

  async validateUniqueWalletAddress(address: string): Promise<boolean> {
    if (!address || address.trim().length === 0) {
      throw new ValidationError(
        "Wallet address cannot be empty",
        "USER_WALLET_REQUIRED"
      );
    }

    const existingUser = await this.userRepository.findByWalletAddress(address);
    return existingUser === null;
  }
}

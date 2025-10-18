import { User } from './user.entity';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  
  findByTelegramId(telegramId: string): Promise<User | null>;
  
  findByWalletAddress(address: string): Promise<User | null>;
  
  findByWalletId(walletId: string): Promise<User | null>;
  
  save(user: User): Promise<void>;
  
  update(user: User): Promise<void>;
  
  delete(id: string): Promise<void>;
  
  exists(telegramId: string): Promise<boolean>;
}

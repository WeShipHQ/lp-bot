import { Position, PositionStatus } from './position.entity';

export interface IPositionRepository {
  findById(id: string): Promise<Position | null>;
  
  findByPositionAddress(positionAddress: string): Promise<Position | null>;
  
  findByUser(userId: string): Promise<Position[]>;
  
  findActiveByUser(userId: string): Promise<Position[]>;
  
  findByUserAndStatus(userId: string, status: PositionStatus): Promise<Position[]>;
  
  findByPoolAddress(poolAddress: string): Promise<Position[]>;
  
  save(position: Position): Promise<void>;
  
  update(position: Position): Promise<void>;
  
  delete(id: string): Promise<void>;
  
  count(userId?: string): Promise<number>;
  
  countActive(userId?: string): Promise<number>;
}

type AssetType =
  | '.claw-skill'
  | '.claw-prompt'
  | '.claw-memory'
  | '.claw-workflow'
  | '.claw-context'
  | '.claw-tool'
  | '.vec'
  | '.traj';

export interface Asset {
  id: string;
  cid: string;
  name: string;
  type: AssetType;
  size: number;
  seederCount: number;
  downloadCount: number;
  creatorName: string;
  creatorId: string;
  createdAt: string;
  description?: string;
  tags?: string[];
}

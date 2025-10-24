import { IDL, LBCLMM_PROGRAM_IDS } from "@meteora-ag/dlmm";
import {
  type Idl,
  type Instruction,
  BorshEventCoder,
  BorshInstructionCoder,
} from "@coral-xyz/anchor";
import { base64, bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes/index.js";
import { CONFIG } from "@/config";
import {
  AccountMeta,
  Connection,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";

type MeteoraDlmmInstructionType = "open" | "add" | "remove" | "claim" | "close";

type MeteoraDlmmInstructionName =
  | "add_liquidity"
  | "add_liquidity2"
  | "add_liquidity_by_strategy"
  | "add_liquidity_by_strategy2"
  | "add_liquidity_by_strategy_one_side"
  | "add_liquidity_by_weight"
  | "add_liquidity_one_side"
  | "add_liquidity_one_side_precise"
  | "add_liquidity_one_side_precise2"
  | "claim_fee"
  | "claim_fee2"
  | "claim_reward"
  | "claim_reward2"
  | "close_claim_protocol_fee_operator"
  | "close_position"
  | "close_position2"
  | "close_position_if_empty"
  | "close_preset_parameter"
  | "close_preset_parameter2"
  | "create_claim_protocol_fee_operator"
  | "decrease_position_length"
  | "for_idl_type_generation_do_not_call"
  | "fund_reward"
  | "go_to_a_bin"
  | "increase_oracle_length"
  | "increase_position_length"
  | "initialize_bin_array"
  | "initialize_bin_array_bitmap_extension"
  | "initialize_customizable_permissionless_lb_pair"
  | "initialize_customizable_permissionless_lb_pair2"
  | "initialize_lb_pair"
  | "initialize_lb_pair2"
  | "initialize_permission_lb_pair"
  | "initialize_position"
  | "initialize_position_by_operator"
  | "initialize_position_pda"
  | "initialize_preset_parameter"
  | "initialize_preset_parameter2"
  | "initialize_reward"
  | "initialize_token_badge"
  | "migrate_bin_array"
  | "migrate_position"
  | "rebalance_liquidity"
  | "remove_all_liquidity"
  | "remove_liquidity"
  | "remove_liquidity2"
  | "remove_liquidity_by_range"
  | "remove_liquidity_by_range2"
  | "set_activation_point"
  | "set_pair_status"
  | "set_pair_status_permissionless"
  | "set_pre_activation_duration"
  | "set_pre_activation_swap_address"
  | "swap"
  | "swap2"
  | "swap_exact_out"
  | "swap_exact_out2"
  | "swap_with_price_impact"
  | "swap_with_price_impact2"
  | "update_base_fee_parameters"
  | "update_dynamic_fee_parameters"
  | "update_fees_and_reward2"
  | "update_fees_and_rewards"
  | "update_position_operator"
  | "update_reward_duration"
  | "update_reward_funder"
  | "withdraw_ineligible_reward"
  | "withdraw_protocol_fee";

const INSTRUCTION_MAP: Map<
  MeteoraDlmmInstructionName,
  MeteoraDlmmInstructionType
> = new Map([
  ["initialize_position", "open"],
  ["initialize_position_pda", "open"],
  ["initialize_position_by_operator", "open"],
  ["rebalance_liquidity", "add"],
  ["add_liquidity", "add"],
  ["add_liquidity2", "add"],
  ["add_liquidity_by_weight", "add"],
  ["add_liquidity_by_strategy", "add"],
  ["add_liquidity_by_strategy2", "add"],
  ["add_liquidity_by_strategy_one_side", "add"],
  ["add_liquidity_one_side", "add"],
  ["add_liquidity_one_side_precise", "add"],
  ["add_liquidity_one_side_precise2", "add"],
  ["remove_liquidity", "remove"],
  ["remove_liquidity2", "remove"],
  ["remove_all_liquidity", "remove"],
  ["remove_liquidity_by_range", "remove"],
  ["remove_liquidity_by_range2", "remove"],
  ["claim_fee", "claim"],
  ["claim_fee2", "claim"],
  ["close_position", "close"],
  ["close_position_if_empty", "close"],
  ["close_position2", "close"],
]);

interface MeteoraDlmmDecodedInstruction extends Instruction {
  name: MeteoraDlmmInstructionName;
  data: any;
}

interface MeteoraDlmmAccounts {
  position: string;
  lbPair: string;
  sender: string;
  tokenXMint?: string | undefined;
  tokenYMint?: string | undefined;
  userTokenX?: string | undefined;
  userTokenY?: string | undefined;
}

export interface TokenTransferInfo {
  mint: string;
  amount: number;
}

export interface MeteoraDlmmInstruction {
  isHawksight: boolean;
  signature: string;
  slot: number;
  blockTime: number;
  instructionName: string;
  instructionType: MeteoraDlmmInstructionType;
  accounts: MeteoraDlmmAccounts;
  tokenTransfers: TokenTransferInfo[];
  activeBinId: number | null;
  removalBps: number | null;
}

const INSTRUCTION_CODER: BorshInstructionCoder = new BorshInstructionCoder(
  IDL as unknown as Idl
);

let EVENT_CODER: BorshEventCoder = new BorshEventCoder(IDL as unknown as Idl);

const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");

export async function init() {
  try {
    const signature =
      //   "2P54LUZ974FbR8AopHd5VNUuvEyZdtDthiBdbppFG1wueL1JxFbwGsUVmuN3NuYPm5FFt2mbi7zPEp5HdSKvp28j";
      // "5jzEkBvsZTMb5xw9ZWQqqvdepSpuNNmHyGuEVKx7A96KJqmkH7KwbvQL1Yp8qytvXT2vEZcbYjv4FarqezJdhdzv";
      "5oRePkfVy73LbSpZsKoXBERxAMTPPLkPMGK1uMudRxT78125MLxDxiBmE3Y7cbpic9ZPTFMsVhkhijQC2LDh3a4Z";

    const parsedTransaction = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    const instructions = parseMeteoraInstructions(parsedTransaction);

    console.dir(instructions, { depth: null });
  } catch (error) {
    console.error("init tx parser error", error);
  }
}

export function parseMeteoraInstructions(
  transaction: ParsedTransactionWithMeta | null
): MeteoraDlmmInstruction[] {
  if (transaction == null) {
    return [];
  }
  const hawksightAccount = getHawksightAccount(transaction);

  const parsedInstructions = transaction.transaction.message.instructions.map(
    (instruction) =>
      parseMeteoraInstruction(transaction, instruction, hawksightAccount)
  );

  if (transaction.meta?.innerInstructions) {
    const innerInstructions = transaction.meta.innerInstructions
      .map((instruction) => instruction.instructions)
      .flat()
      .map((instruction) =>
        parseMeteoraInstruction(transaction, instruction, hawksightAccount)
      );
    return parsedInstructions
      .concat(innerInstructions)
      .filter((instruction) => instruction !== null);
  }
  return parsedInstructions.filter((instruction) => instruction !== null);
}

function parseMeteoraInstruction(
  transaction: ParsedTransactionWithMeta,
  instruction: PartiallyDecodedInstruction | ParsedInstruction,
  hawksightAccount: string | null
) {
  if (instruction.programId.toBase58() == LBCLMM_PROGRAM_IDS["mainnet-beta"]) {
    try {
      if ("data" in instruction) {
        return getMeteoraInstructionData(
          transaction,
          instruction,
          hawksightAccount
        );
      }
    } catch (err) {
      console.error(err);
      throw new Error(
        `Failed to parse Meteora DLMM instruction on signature ${transaction.transaction.signatures[0]}`
      );
    }
  }
  return null;
}

function getMeteoraInstructionData(
  transaction: ParsedTransactionWithMeta,
  instruction: PartiallyDecodedInstruction,
  hawksightAccount: string | null
): MeteoraDlmmInstruction | null {
  const decodedInstruction = INSTRUCTION_CODER.decode(
    instruction.data,
    "base58"
  ) as MeteoraDlmmDecodedInstruction;

  if (!transaction.blockTime) {
    throw new Error(
      `Transaction blockTime missing from signature ${transaction.transaction.signatures[0]}`
    );
  }
  if (!decodedInstruction || !INSTRUCTION_MAP.has(decodedInstruction.name)) {
    // Unknown instruction
    return null;
  }
  const index = getInstructionIndex(transaction, instruction);
  if (index == -1) {
    return null;
  }
  const instructionName = decodedInstruction.name;
  const instructionType = INSTRUCTION_MAP.get(decodedInstruction.name)!;
  const accountMetas = getAccountMetas(transaction, instruction);
  const accounts = getPositionAccounts(
    decodedInstruction,
    accountMetas,
    hawksightAccount
  );
  const parsedTokenTransfers = !hawksightAccount
    ? getTokenTransfers(transaction, index)
    : getHawksightTokenTransfers(transaction, instruction, index);
  const tokenTransfers = parseTokenTransfers(parsedTokenTransfers, accounts);
  const activeBinId =
    parsedTokenTransfers.length > 0 ? getActiveBinId(transaction, index) : null;
  const removalBps =
    instructionType == "remove" ? getRemovalBps(decodedInstruction) : null;

  return {
    isHawksight: Boolean(hawksightAccount),
    signature: transaction.transaction.signatures[0],
    slot: transaction.slot,
    blockTime: transaction.blockTime,
    instructionName,
    instructionType,
    accounts,
    tokenTransfers,
    activeBinId,
    removalBps,
  };
}

// gHawksight
export const HAWKSIGHT_PROGRAM_ID =
  "FqGg2Y1FNxMiGd51Q6UETixQWkF5fB92MysbYogRJb3P";

export function getHawksightAccount(
  transaction: ParsedTransactionWithMeta | null
): string | null {
  if (transaction == null) {
    return null;
  }

  const hawksightInstruction =
    transaction.transaction.message.instructions.find(
      (instruction) =>
        instruction.programId.toBase58() ==
          "FqGg2Y1FNxMiGd51Q6UETixQWkF5fB92MysbYogRJb3P" &&
        "accounts" in instruction &&
        (instruction.accounts.length == 10 ||
          instruction.accounts.length == 15 ||
          instruction.accounts.length == 21 ||
          instruction.accounts.length == 23 ||
          instruction.accounts.length == 7)
    ) as PartiallyDecodedInstruction;

  if (hawksightInstruction) {
    switch (hawksightInstruction.accounts.length) {
      case 10:
      case 15:
      case 21:
      case 23:
        return hawksightInstruction.accounts[2].toBase58();
      case 7:
        return hawksightInstruction.accounts[1].toBase58();
    }
  }

  return null;
}

export function getHawksightTokenTransfers(
  transaction: ParsedTransactionWithMeta,
  meteoraInstruction: PartiallyDecodedInstruction,
  index: number
): (ParsedInstruction | PartiallyDecodedInstruction)[] {
  if (index == -1) {
    return [];
  }

  const hawksightInstruction = transaction.meta?.innerInstructions?.find(
    (i) => i.index == index
  );

  if (hawksightInstruction == undefined) {
    return [];
  }

  const meteoraInstructionIndex =
    hawksightInstruction.instructions.indexOf(meteoraInstruction);
  const nextMeteoraInstructionIndex = hawksightInstruction.instructions
    .filter(
      (i, index) =>
        i.programId.toBase58() == LBCLMM_PROGRAM_IDS["mainnet-beta"] &&
        index > meteoraInstructionIndex + 1
    )
    .map((i) => hawksightInstruction.instructions.indexOf(i))[0];

  return hawksightInstruction.instructions.filter(
    (i, index) =>
      "program" in i &&
      i.program == "spl-token" &&
      "parsed" in i &&
      i.parsed.type == "transferChecked" &&
      index > meteoraInstructionIndex &&
      index < nextMeteoraInstructionIndex
  );
}

// utils
export function getInstructionIndex(
  transaction: ParsedTransactionWithMeta,
  instruction: PartiallyDecodedInstruction
): number {
  const index =
    transaction.transaction.message.instructions.indexOf(instruction);

  if (index != -1) {
    return index;
  }

  if (transaction.meta?.innerInstructions) {
    const outerInstruction = transaction.meta.innerInstructions.find(
      (innerInstruction) =>
        innerInstruction.instructions.find((i) => i == instruction)
    );

    if (outerInstruction) {
      return outerInstruction.index;
    }

    return -1;
  }

  return -1;
}

export function getAccountMetas(
  transaction: ParsedTransactionWithMeta,
  instruction: PartiallyDecodedInstruction
): AccountMeta[] {
  const accounts = instruction.accounts;
  return accounts
    .map((account) => {
      const data = transaction.transaction.message.accountKeys.find(
        (key) => key.pubkey.toBase58() == account.toBase58()
      );
      if (data) {
        const { pubkey, signer: isSigner, writable: isWritable } = data;

        return {
          pubkey,
          isSigner,
          isWritable,
        };
      }
      return null;
    })
    .filter((meta) => meta !== null);
}

function getPositionAccounts(
  decodedInstruction: MeteoraDlmmDecodedInstruction,
  accountMetas: AccountMeta[],
  hawksightAccount: string | null
): MeteoraDlmmAccounts {
  try {
    const { accounts } = INSTRUCTION_CODER.format(
      decodedInstruction,
      accountMetas
    )!;
    const positionAccount = accounts.find(
      (account) => account.name == "Position"
    )!;
    const position = positionAccount.pubkey.toBase58();
    const lbPairAccount = accounts.find(
      (account) => account.name == "Lb_pair"
    )!;
    const lbPair = lbPairAccount.pubkey.toBase58();
    const senderAccount = accounts.find(
      (account) => account.name == "Sender" || account.name == "Owner"
    )!;
    const sender = hawksightAccount || senderAccount.pubkey.toBase58();
    const tokenXMint = accounts
      .find((account) => account.name == "Token_x_mint")
      ?.pubkey?.toBase58();
    const tokenYMint = accounts
      .find((account) => account.name == "Token_y_mint")
      ?.pubkey?.toBase58();
    const userTokenX = accounts
      .find((account) => account.name == "User_token_x")
      ?.pubkey?.toBase58();
    const userTokenY = accounts
      .find((account) => account.name == "User_token_y")
      ?.pubkey?.toBase58();

    return {
      position,
      lbPair,
      sender,
      tokenXMint,
      tokenYMint,
      userTokenX,
      userTokenY,
    };
  } catch (err) {
    switch (decodedInstruction.name) {
      case "initialize_position":
        return {
          position: accountMetas[1].pubkey.toBase58(),
          lbPair: accountMetas[2].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[3].pubkey.toBase58(),
        };

      case "add_liquidity_one_side":
      case "add_liquidity_one_side_precise":
        return {
          position: accountMetas[0].pubkey.toBase58(),
          lbPair: accountMetas[1].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[8].pubkey.toBase58(),
        };

      case "add_liquidity_by_weight":
        return {
          position: accountMetas[0].pubkey.toBase58(),
          lbPair: accountMetas[1].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[11].pubkey.toBase58(),
        };

      case "add_liquidity2":
      case "add_liquidity_by_strategy2":
      case "remove_liquidity2":
      case "remove_liquidity_by_range2":
        return {
          position: accountMetas[0].pubkey.toBase58(),
          lbPair: accountMetas[1].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[9].pubkey.toBase58(),
        };

      case "add_liquidity_one_side_precise2":
        return {
          position: accountMetas[0].pubkey.toBase58(),
          lbPair: accountMetas[1].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[6].pubkey.toBase58(),
        };

      case "claim_fee2":
        return {
          position: accountMetas[1].pubkey.toBase58(),
          lbPair: accountMetas[0].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[2].pubkey.toBase58(),
        };

      case "close_position2":
      case "close_position_if_empty":
        return {
          position: accountMetas[0].pubkey.toBase58(),
          lbPair: "",
          sender: hawksightAccount || accountMetas[1].pubkey.toBase58(),
        };

      // Add missing instructions with reasonable defaults
      case "initialize_position_pda":
      case "initialize_position_by_operator":
        return {
          position: accountMetas[0].pubkey.toBase58(),
          lbPair: accountMetas[1].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[2].pubkey.toBase58(),
        };

      case "add_liquidity":
      case "add_liquidity_by_strategy":
      case "add_liquidity_by_strategy_one_side":
        return {
          position: accountMetas[0].pubkey.toBase58(),
          lbPair: accountMetas[1].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[7].pubkey.toBase58(),
        };

      case "remove_liquidity":
      case "remove_all_liquidity":
      case "remove_liquidity_by_range":
        return {
          position: accountMetas[0].pubkey.toBase58(),
          lbPair: accountMetas[1].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[7].pubkey.toBase58(),
        };

      case "claim_fee":
        return {
          position: accountMetas[1].pubkey.toBase58(),
          lbPair: accountMetas[0].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[2].pubkey.toBase58(),
        };

      case "close_position":
        return {
          position: accountMetas[0].pubkey.toBase58(),
          lbPair: "",
          sender: hawksightAccount || accountMetas[1].pubkey.toBase58(),
        };
    }

    return {
      position: accountMetas[0].pubkey.toBase58(),
      lbPair: accountMetas[1].pubkey.toBase58(),
      sender: hawksightAccount || accountMetas[11].pubkey.toBase58(),
    };
  }
}

function getActiveBinId(
  transaction: ParsedTransactionWithMeta,
  index: number
): number | null {
  if (transaction.meta && transaction.meta.innerInstructions) {
    const parsedInnerInstruction = transaction.meta.innerInstructions.find(
      (i) => i.index == index
    );
    if (parsedInnerInstruction && parsedInnerInstruction.instructions) {
      const instructions = parsedInnerInstruction.instructions;
      const meteoraInstructions = instructions.filter(
        (instruction) =>
          instruction.programId.toBase58() == LBCLMM_PROGRAM_IDS["mainnet-beta"]
      ) as PartiallyDecodedInstruction[];

      const events = meteoraInstructions.map((instruction) => {
        const ixData = bs58.decode(instruction.data);
        // @ts-ignore
        const eventData = base64.encode(ixData.subarray(8));

        return EVENT_CODER.decode(eventData);
      });

      const eventWithActiveBinId = events.find(
        (event) =>
          event && ("active_bin_id" in event.data || "bin_id" in event.data)
      );

      return eventWithActiveBinId
        ? (eventWithActiveBinId.data.active_bin_id as number) ||
            (eventWithActiveBinId.data.bin_id as number)
        : null;
    }
  }
  return null;
}

function getRemovalBps(
  decodedInstruction: MeteoraDlmmDecodedInstruction
): number | null {
  if ("bpsToRemove" in decodedInstruction.data) {
    return Number(decodedInstruction.data.bpsToRemove);
  }
  if ("binLiquidityRemoval" in decodedInstruction.data) {
    return Number(decodedInstruction.data.binLiquidityRemoval[0].bpsToRemove);
  }
  if (decodedInstruction.name.match(/remove/i)) {
    return 10000;
  }
  return null;
}

export function getTokenTransfers(
  transaction: ParsedTransactionWithMeta,
  index: number
): (ParsedInstruction | PartiallyDecodedInstruction)[] {
  if (index == -1) {
    return [];
  }

  const instruction = transaction.meta?.innerInstructions?.find(
    (i) => i.index == index
  );

  if (instruction == undefined) {
    return [];
  }

  return instruction.instructions.filter(
    (i) =>
      "program" in i &&
      i.program == "spl-token" &&
      "parsed" in i &&
      i.parsed.type.match(/^transfer/) !== null
  );
}

function parseTokenTransfers(
  transfers: (ParsedInstruction | PartiallyDecodedInstruction)[],
  accounts: MeteoraDlmmAccounts
): TokenTransferInfo[] {
  return transfers
    .map((transfer) => {
      if (
        "program" in transfer &&
        transfer.program == "spl-token" &&
        "parsed" in transfer
      ) {
        if (transfer.parsed.type == "transferChecked") {
          const { mint, tokenAmount } = transfer.parsed.info;
          const amount = Number(tokenAmount.amount);

          return {
            mint,
            amount,
          };
        }
        if (
          !accounts.tokenXMint ||
          !accounts.tokenYMint ||
          !accounts.userTokenX ||
          !accounts.userTokenY
        ) {
          throw new Error(
            "Mints were not found in instruction, unable to parse token transfers"
          );
        }
        const mint =
          transfer.parsed.info.source == accounts.userTokenX ||
          transfer.parsed.info.destination == accounts.userTokenX
            ? accounts.tokenXMint
            : accounts.tokenYMint;
        const amount = Number(transfer.parsed.info.amount);

        return {
          mint,
          amount,
        };
      }
      throw new Error("Unrecognized transfer format");
    })
    .filter((transfer) => transfer !== undefined);
}

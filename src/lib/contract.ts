import algosdk from 'algosdk'
import { APP_ID, MAX_SLOTS, VOI_NETWORK } from '../config'
import contractSpec from '../abi/VoiGovernance.json'

export const algodClient = new algosdk.Algodv2('', VOI_NETWORK.algodServer, 443)

export const indexerClient = new algosdk.Indexer('', VOI_NETWORK.indexerServer, 443)

const abiContract = new algosdk.ABIContract(contractSpec)

export interface ContractGlobalState {
  admin?: string
  whitelist: string[]
  maxSlots: number
}

export interface ProposalState {
  slot: number
  active: boolean
  proposalId: number
  yea: number
  nay: number
  abstain: number
  expiration: number
  voteMask: bigint
  exists: boolean
}

function decodeAddress(value: Uint8Array): string {
  return algosdk.encodeAddress(value)
}

function decodeWhitelist(value: Uint8Array): string[] {
  if (value.length < 2) return []
  const count = (value[0] << 8) | value[1]
  const addresses: string[] = []
  for (let i = 0; i < count; i++) {
    const start = 2 + i * 32
    addresses.push(decodeAddress(value.slice(start, start + 32)))
  }
  return addresses
}

function readUint64(data: Uint8Array, start: number): number {
  let value = 0n
  for (let i = 0; i < 8; i++) {
    value = (value << 8n) | BigInt(data[start + i])
  }
  return Number(value)
}

export function slotBoxName(slot: number): Uint8Array {
  const prefix = new TextEncoder().encode('slot_')
  const slotBytes = algosdk.encodeUint64(slot)
  const name = new Uint8Array(prefix.length + slotBytes.length)
  name.set(prefix)
  name.set(slotBytes, prefix.length)
  return name
}

export async function fetchGlobalState(): Promise<ContractGlobalState> {
  const app = await algodClient.getApplicationByID(APP_ID).do()
  const globalState = app.params?.globalState ?? []

  let admin: string | undefined
  let whitelist: string[] = []
  let maxSlots = MAX_SLOTS

  for (const item of globalState) {
    const key = new TextDecoder().decode(item.key)
    if (item.value.type === 1) {
      const bytes = item.value.bytes instanceof Uint8Array
        ? item.value.bytes
        : Uint8Array.from(atob(String(item.value.bytes)), (c) => c.charCodeAt(0))
      if (key === 'admin') admin = decodeAddress(bytes)
      if (key === 'whitelist') whitelist = decodeWhitelist(bytes)
    }
    if (item.value.type === 2 && key === 'MAX_SLOTS') {
      maxSlots = Number(item.value.uint)
    }
  }

  return { admin, whitelist, maxSlots }
}

export async function fetchProposal(slot: number): Promise<ProposalState> {
  const empty: ProposalState = {
    slot,
    active: false,
    proposalId: 0,
    yea: 0,
    nay: 0,
    abstain: 0,
    expiration: 0,
    voteMask: 0n,
    exists: false,
  }

  try {
    const box = await algodClient
      .getApplicationBoxByName(APP_ID, slotBoxName(slot))
      .do()
    const data = box.value
    if (!data || data.length < 49) return empty

    const active = data[0] === 1
    return {
      slot,
      active,
      proposalId: readUint64(data, 1),
      yea: readUint64(data, 9),
      nay: readUint64(data, 17),
      abstain: readUint64(data, 25),
      expiration: readUint64(data, 33),
      voteMask: BigInt(readUint64(data, 41)),
      exists: true,
    }
  } catch {
    return empty
  }
}

export async function fetchAllProposals(): Promise<ProposalState[]> {
  const proposals = await Promise.all(
    Array.from({ length: MAX_SLOTS }, (_, slot) => fetchProposal(slot)),
  )
  return proposals
}

export function hasVoted(proposal: ProposalState, voterIndex: number): boolean {
  const bit = 1n << BigInt(voterIndex)
  return (proposal.voteMask & bit) !== 0n
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

type MethodArgs = algosdk.ABIValue[]

export async function sendContractCall(params: {
  methodName: string
  methodArgs: MethodArgs
  sender: string
  signer: algosdk.TransactionSigner
  boxNames?: Uint8Array[]
}): Promise<string> {
  const method = abiContract.getMethodByName(params.methodName)
  const atc = new algosdk.AtomicTransactionComposer()
  const suggestedParams = await algodClient.getTransactionParams().do()

  atc.addMethodCall({
    appID: APP_ID,
    method,
    methodArgs: params.methodArgs,
    sender: params.sender,
    signer: params.signer,
    suggestedParams: { ...suggestedParams, flatFee: true, fee: 3000 },
    boxes: params.boxNames?.map((name) => ({ appIndex: APP_ID, name })),
  })

  const result = await atc.execute(algodClient, 4)
  const txId = result.txIDs[0]
  if (!txId) throw new Error('Transaction failed to submit')
  return txId
}

export async function updateWhitelist(
  addresses: string[],
  sender: string,
  signer: algosdk.TransactionSigner,
): Promise<string> {
  return sendContractCall({
    methodName: 'update_whitelist',
    methodArgs: [addresses],
    sender,
    signer,
  })
}

export async function initializeProposal(
  slot: number,
  proposalId: number,
  durationSeconds: number,
  sender: string,
  signer: algosdk.TransactionSigner,
): Promise<string> {
  return sendContractCall({
    methodName: 'initialize_proposal',
    methodArgs: [slot, proposalId, durationSeconds],
    sender,
    signer,
    boxNames: [slotBoxName(slot)],
  })
}

export async function castVote(
  slot: number,
  voteType: number,
  sender: string,
  signer: algosdk.TransactionSigner,
): Promise<string> {
  return sendContractCall({
    methodName: 'cast_vote',
    methodArgs: [slot, voteType],
    sender,
    signer,
    boxNames: [slotBoxName(slot)],
  })
}

export async function evaluateExpiration(
  slot: number,
  sender: string,
  signer: algosdk.TransactionSigner,
): Promise<string> {
  return sendContractCall({
    methodName: 'evaluate_expiration',
    methodArgs: [slot],
    sender,
    signer,
    boxNames: [slotBoxName(slot)],
  })
}

export function explorerTxUrl(txId: string): string {
  return `https://explorer.voi.network/tx/${txId}`
}

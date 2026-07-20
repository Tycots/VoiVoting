from algopy import Account, ARC4Contract, Global, Txn, UInt64, arc4, Bytes, log, op, subroutine

@subroutine
def uint_to_ascii(n: UInt64) -> Bytes:
    """Converts a UInt64 integer into a human-readable ASCII Bytes string."""
    if n == UInt64(0):
        return Bytes(b"0")
    
    digits = Bytes(b"")
    while n > UInt64(0):
        remainder = n % UInt64(10)
        # 48 is the ASCII offset for the character '0'
        char_code = remainder + UInt64(48)
        # Extract just the final byte of the uint64 and prepend it
        digits = op.substring(op.itob(char_code), UInt64(7), UInt64(8)) + digits
        n = n // UInt64(10)
        
    return digits

class VoiGovernance(ARC4Contract):
    def __init__(self) -> None:
        # Administrative control
        self.admin = Txn.sender
        
        # Configuration constants
        self.MAX_SLOTS = UInt64(10)
        
        # Updatable Whitelist (Array of up to 10 addresses)
        self.whitelist = arc4.DynamicArray[arc4.Address]()

    @arc4.abimethod
    def change_admin(self, new_admin: Account) -> None:
        """Allows the current administrator to hand over control to another single wallet or multi-sig."""
        assert Txn.sender == self.admin, "Unauthorized: Only admin can change admin"
        self.admin = new_admin

    @arc4.abimethod
    def update_whitelist(self, new_whitelist: arc4.DynamicArray[arc4.Address]) -> None:
        """Allows the admin to completely update or overwrite the active voting wallets (Max 10)."""
        assert Txn.sender == self.admin, "Unauthorized: Only admin can update whitelist"
        assert new_whitelist.length <= UInt64(10), "Whitelist cannot exceed 10 wallets"
        self.whitelist = new_whitelist.copy()

    @arc4.abimethod
    def initialize_proposal(self, slot: UInt64, proposal_id: UInt64, duration: UInt64) -> None:
        """Initializes a brand-new proposal with a custom duration (in seconds) inside one of the 10 slots."""
        assert Txn.sender == self.admin, "Unauthorized: Only admin can initialize proposals"
        assert slot < self.MAX_SLOTS, "Invalid slot index: Must be 0-9"
        
        box_key = Bytes(b"slot_") + op.itob(slot)
        
        # Unpack the tuple returned by Box.get() to check existence and data safely
        data, exists = op.Box.get(box_key)
        if exists:
            status_bytes = op.substring(data, UInt64(0), UInt64(1))
            assert status_bytes == Bytes(b"\x00"), "Slot is currently active with another proposal"

        # Calculate expiration dynamically based on the passed duration
        expiration = Global.latest_timestamp + duration
        
        payload = (
            Bytes(b"\x01") +                       # Active
            op.itob(proposal_id) +                 # ID
            op.itob(UInt64(0)) +                   # Yea
            op.itob(UInt64(0)) +                   # Nay
            op.itob(UInt64(0)) +                   # Abstain
            op.itob(expiration) +                  # Expiration
            op.itob(UInt64(0))                     # Vote Bitmask
        )
        
        op.Box.put(box_key, payload)

    @arc4.abimethod
    def cast_vote(self, slot: UInt64, vote_type: UInt64) -> None:
        """Allows a whitelisted wallet to cast exactly one vote (1=Yea, 2=Nay, 3=Abstain)."""
        assert slot < self.MAX_SLOTS, "Invalid slot index"
        box_key = Bytes(b"slot_") + op.itob(slot)
        
        # Unpack tuple: checking existence and getting the pure data string simultaneously
        data, exists = op.Box.get(box_key)
        assert exists, "Proposal slot not initialized"

        # 1. Verify caller is whitelisted using an AVM-safe while loop
        voter_address = arc4.Address(Txn.sender)
        is_whitelisted = False
        voter_index = UInt64(0)
        
        i = UInt64(0)
        while i < self.whitelist.length:
            if self.whitelist[i] == voter_address:
                is_whitelisted = True
                voter_index = i
                break
            i += 1
                
        assert is_whitelisted, "Unauthorized: Sender wallet is not whitelisted"

        # 2. Extract parameters safely out of the clean Bytes string
        assert op.substring(data, UInt64(0), UInt64(1)) == Bytes(b"\x01"), "Proposal is not active"
        
        proposal_id = op.btoi(op.substring(data, UInt64(1), UInt64(9)))
        yea = op.btoi(op.substring(data, UInt64(9), UInt64(17)))
        nay = op.btoi(op.substring(data, UInt64(17), UInt64(25)))
        abstain = op.btoi(op.substring(data, UInt64(25), UInt64(33)))
        expiration = op.btoi(op.substring(data, UInt64(33), UInt64(41)))
        vote_mask = op.btoi(op.substring(data, UInt64(41), UInt64(49)))

        # 3. Guardrails: Check expiration window
        assert Global.latest_timestamp <= expiration, "Voting window has already expired"

        # 4. Check bitmask to ensure this index hasn't voted yet
        voter_bit = UInt64(1) << voter_index
        assert (vote_mask & voter_bit) == UInt64(0), "Double-voting rejected: Wallet already voted"

        # 5. Increment correct tally bucket
        if vote_type == UInt64(1):
            yea += UInt64(1)
        elif vote_type == UInt64(2):
            nay += UInt64(1)
        elif vote_type == UInt64(3):
            abstain += UInt64(1)
        else:
            assert False, "Invalid vote type: Use 1=Yea, 2=Nay, 3=Abstain"

        # Update bitmask to register this wallet's vote
        vote_mask = vote_mask | voter_bit
        total_votes_cast = yea + nay + abstain

        # 6. Save data back to storage
        updated_payload = (
            Bytes(b"\x01") +
            op.itob(proposal_id) +
            op.itob(yea) +
            op.itob(nay) +
            op.itob(abstain) +
            op.itob(expiration) +
            op.itob(vote_mask)
        )
        op.Box.put(box_key, updated_payload)

        # 7. Check Trigger: If all whitelisted members voted, auto-finalize
        if total_votes_cast == self.whitelist.length:
            self._finalize_and_clear(slot, proposal_id, yea, nay, abstain, Bytes(b"All whitelisted wallets voted"))

    @arc4.abimethod
    def evaluate_expiration(self, slot: UInt64) -> None:
        """Can be called by anyone after the duration to process an expired proposal and clear the slot."""
        assert slot < self.MAX_SLOTS, "Invalid slot index"
        box_key = Bytes(b"slot_") + op.itob(slot)
        
        data, exists = op.Box.get(box_key)
        assert exists, "Proposal slot not initialized"

        assert op.substring(data, UInt64(0), UInt64(1)) == Bytes(b"\x01"), "Proposal slot is not active"
        
        expiration = op.btoi(op.substring(data, UInt64(33), UInt64(41)))
        assert Global.latest_timestamp > expiration, "Voting window is still open"

        proposal_id = op.btoi(op.substring(data, UInt64(1), UInt64(9)))
        yea = op.btoi(op.substring(data, UInt64(9), UInt64(17)))
        nay = op.btoi(op.substring(data, UInt64(17), UInt64(25)))
        abstain = op.btoi(op.substring(data, UInt64(25), UInt64(33)))

        self._finalize_and_clear(slot, proposal_id, yea, nay, abstain, Bytes(b"Voting window expired"))

    def _finalize_and_clear(self, slot: UInt64, proposal_id: UInt64, yea: UInt64, nay: UInt64, abstain: UInt64, reason: Bytes) -> None:
        """Internal helper to broadcast the final result string on-chain and reset the slot status."""
        box_key = Bytes(b"slot_") + op.itob(slot)
        
        # Broadcast ARC-28 compliant log event containing CLEAN plain text metrics
        log(Bytes(b"PROPOSAL_FINALIZED_ID:") + uint_to_ascii(proposal_id) + 
            Bytes(b"|Y:") + uint_to_ascii(yea) + 
            Bytes(b"|N:") + uint_to_ascii(nay) + 
            Bytes(b"|A:") + uint_to_ascii(abstain) +
            Bytes(b"|Reason:") + reason)

        # Flag the active byte to \x00. This opens the slot back up for a new proposal initialization.
        empty_payload = (
            Bytes(b"\x00") +
            op.itob(UInt64(0)) +
            op.itob(UInt64(0)) +
            op.itob(UInt64(0)) +
            op.itob(UInt64(0)) +
            op.itob(UInt64(0)) +
            op.itob(UInt64(0))
        )
        op.Box.put(box_key, empty_payload)
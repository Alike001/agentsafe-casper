#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]
extern crate alloc;

use alloc::string::String;
use odra::prelude::*;

const DAY_MS: u64 = 86_400_000;

#[odra::odra_error]
pub enum MandateError {
    MandateAlreadyExists = 20_000,
    MandateNotFound = 20_001,
    Unauthorized = 20_002,
    InvalidConfiguration = 20_003,
    MandateInactive = 20_004,
    MandateNotYetValid = 20_005,
    MandateExpired = 20_006,
    ServiceNotAllowed = 20_007,
    AmountOverLimit = 20_008,
    BudgetExceeded = 20_009,
    ApprovalRequired = 20_010,
    DuplicateAction = 20_011,
    ActionNotAuthorized = 20_012,
    SettlementAlreadyRecorded = 20_013,
    ArithmeticOverflow = 20_014,
}

#[odra::event]
pub struct MandateCreated {
    pub mandate_id: String,
    pub owner: Address,
    pub agent: Address,
    pub policy_hash: String,
    pub daily_budget: u64,
    pub expires_at: u64,
}

#[odra::event]
pub struct ActionAuthorized {
    pub mandate_id: String,
    pub action_hash: String,
    pub service_id: String,
    pub amount: u64,
    pub spent_in_window: u64,
}

#[odra::event]
pub struct SettlementRecorded {
    pub mandate_id: String,
    pub action_hash: String,
    pub settlement_hash: String,
    pub result_hash: String,
}

#[odra::event]
pub struct MandateRevoked {
    pub mandate_id: String,
    pub owner: Address,
}

#[odra::module(
    errors = MandateError,
    events = [MandateCreated, ActionAuthorized, SettlementRecorded, MandateRevoked]
)]
pub struct MandateGuard {
    mandate_count: Var<u64>,
    owners: Mapping<String, Address>,
    agents: Mapping<String, Address>,
    agent_ids: Mapping<String, String>,
    policy_hashes: Mapping<String, String>,
    max_amounts: Mapping<String, u64>,
    daily_budgets: Mapping<String, u64>,
    approval_thresholds: Mapping<String, u64>,
    spent_in_window: Mapping<String, u64>,
    window_started_at: Mapping<String, u64>,
    valid_from: Mapping<String, u64>,
    expires_at: Mapping<String, u64>,
    active: Mapping<String, bool>,
    allowed_services: Mapping<(String, String), bool>,
    authorized_actions: Mapping<(String, String), bool>,
    settlements: Mapping<(String, String), String>,
    last_action_hashes: Mapping<String, String>,
}

#[odra::module]
impl MandateGuard {
    pub fn init(&mut self) {
        self.mandate_count.set(0);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_mandate(
        &mut self,
        mandate_id: String,
        agent: Address,
        agent_id: String,
        policy_hash: String,
        allowed_service_id: String,
        max_amount_per_action: u64,
        daily_budget: u64,
        approval_threshold: u64,
        valid_from: u64,
        expires_at: u64,
    ) {
        if self.owners.get(&mandate_id).is_some() {
            self.env().revert(MandateError::MandateAlreadyExists);
        }
        if mandate_id.is_empty()
            || agent_id.is_empty()
            || policy_hash.is_empty()
            || allowed_service_id.is_empty()
            || max_amount_per_action == 0
            || daily_budget < max_amount_per_action
            || approval_threshold > max_amount_per_action
            || expires_at <= valid_from
        {
            self.env().revert(MandateError::InvalidConfiguration);
        }

        let owner = self.env().caller();
        let now = self.env().get_block_time();
        let service_key = (mandate_id.clone(), allowed_service_id);

        self.owners.set(&mandate_id, owner);
        self.agents.set(&mandate_id, agent);
        self.agent_ids.set(&mandate_id, agent_id);
        self.policy_hashes.set(&mandate_id, policy_hash.clone());
        self.max_amounts.set(&mandate_id, max_amount_per_action);
        self.daily_budgets.set(&mandate_id, daily_budget);
        self.approval_thresholds
            .set(&mandate_id, approval_threshold);
        self.spent_in_window.set(&mandate_id, 0);
        self.window_started_at.set(&mandate_id, now);
        self.valid_from.set(&mandate_id, valid_from);
        self.expires_at.set(&mandate_id, expires_at);
        self.active.set(&mandate_id, true);
        self.allowed_services.set(&service_key, true);
        self.mandate_count
            .set(self.mandate_count.get_or_default() + 1);

        self.env().emit_event(MandateCreated {
            mandate_id,
            owner,
            agent,
            policy_hash,
            daily_budget,
            expires_at,
        });
    }

    pub fn add_allowed_service(&mut self, mandate_id: String, service_id: String) {
        self.require_owner(&mandate_id);
        if service_id.is_empty() {
            self.env().revert(MandateError::InvalidConfiguration);
        }
        self.allowed_services
            .set(&(mandate_id, service_id), true);
    }

    pub fn authorize_action(
        &mut self,
        mandate_id: String,
        action_hash: String,
        service_id: String,
        amount: u64,
    ) -> u64 {
        let owner = self.owner_of(&mandate_id);
        let agent = self.agent_of(&mandate_id);
        let caller = self.env().caller();
        if caller != owner && caller != agent {
            self.env().revert(MandateError::Unauthorized);
        }
        if !self.active.get_or_default(&mandate_id) {
            self.env().revert(MandateError::MandateInactive);
        }

        let now = self.env().get_block_time();
        if now < self.valid_from.get_or_default(&mandate_id) {
            self.env().revert(MandateError::MandateNotYetValid);
        }
        if now >= self.expires_at.get_or_default(&mandate_id) {
            self.env().revert(MandateError::MandateExpired);
        }
        if !self
            .allowed_services
            .get_or_default(&(mandate_id.clone(), service_id.clone()))
        {
            self.env().revert(MandateError::ServiceNotAllowed);
        }
        if amount == 0 || amount > self.max_amounts.get_or_default(&mandate_id) {
            self.env().revert(MandateError::AmountOverLimit);
        }
        if caller != owner && amount > self.approval_thresholds.get_or_default(&mandate_id) {
            self.env().revert(MandateError::ApprovalRequired);
        }

        let action_key = (mandate_id.clone(), action_hash.clone());
        if action_hash.is_empty() || self.authorized_actions.get_or_default(&action_key) {
            self.env().revert(MandateError::DuplicateAction);
        }

        let mut window_started_at = self.window_started_at.get_or_default(&mandate_id);
        let mut spent = self.spent_in_window.get_or_default(&mandate_id);
        if now >= window_started_at.saturating_add(DAY_MS) {
            window_started_at = now;
            spent = 0;
            self.window_started_at
                .set(&mandate_id, window_started_at);
        }

        let updated_spent = match spent.checked_add(amount) {
            Some(value) => value,
            None => self.env().revert(MandateError::ArithmeticOverflow),
        };
        if updated_spent > self.daily_budgets.get_or_default(&mandate_id) {
            self.env().revert(MandateError::BudgetExceeded);
        }

        self.spent_in_window.set(&mandate_id, updated_spent);
        self.authorized_actions.set(&action_key, true);
        self.last_action_hashes.set(&mandate_id, action_hash.clone());
        self.env().emit_event(ActionAuthorized {
            mandate_id,
            action_hash,
            service_id,
            amount,
            spent_in_window: updated_spent,
        });

        updated_spent
    }

    pub fn record_settlement(
        &mut self,
        mandate_id: String,
        action_hash: String,
        settlement_hash: String,
        result_hash: String,
    ) {
        self.require_owner_or_agent(&mandate_id);
        let action_key = (mandate_id.clone(), action_hash.clone());
        if !self.authorized_actions.get_or_default(&action_key) {
            self.env().revert(MandateError::ActionNotAuthorized);
        }
        if self.settlements.get(&action_key).is_some() {
            self.env()
                .revert(MandateError::SettlementAlreadyRecorded);
        }
        if settlement_hash.is_empty() || result_hash.is_empty() {
            self.env().revert(MandateError::InvalidConfiguration);
        }

        self.settlements
            .set(&action_key, settlement_hash.clone());
        self.env().emit_event(SettlementRecorded {
            mandate_id,
            action_hash,
            settlement_hash,
            result_hash,
        });
    }

    pub fn revoke_mandate(&mut self, mandate_id: String) {
        let owner = self.require_owner(&mandate_id);
        self.active.set(&mandate_id, false);
        self.env().emit_event(MandateRevoked { mandate_id, owner });
    }

    pub fn mandate_count(&self) -> u64 {
        self.mandate_count.get_or_default()
    }

    pub fn owner(&self, mandate_id: String) -> Address {
        self.owner_of(&mandate_id)
    }

    pub fn agent(&self, mandate_id: String) -> Address {
        self.agent_of(&mandate_id)
    }

    pub fn policy_hash(&self, mandate_id: String) -> String {
        self.require_exists(&mandate_id);
        self.policy_hashes.get_or_default(&mandate_id)
    }

    pub fn is_active(&self, mandate_id: String) -> bool {
        self.require_exists(&mandate_id);
        self.active.get_or_default(&mandate_id)
    }

    pub fn spent_today(&self, mandate_id: String) -> u64 {
        self.require_exists(&mandate_id);
        self.spent_in_window.get_or_default(&mandate_id)
    }

    pub fn daily_budget(&self, mandate_id: String) -> u64 {
        self.require_exists(&mandate_id);
        self.daily_budgets.get_or_default(&mandate_id)
    }

    pub fn last_action_hash(&self, mandate_id: String) -> String {
        self.require_exists(&mandate_id);
        self.last_action_hashes.get_or_default(&mandate_id)
    }

    pub fn settlement_hash(&self, mandate_id: String, action_hash: String) -> String {
        self.require_exists(&mandate_id);
        self.settlements
            .get_or_default(&(mandate_id, action_hash))
    }
}

impl MandateGuard {
    fn require_exists(&self, mandate_id: &String) {
        if self.owners.get(mandate_id).is_none() {
            self.env().revert(MandateError::MandateNotFound);
        }
    }

    fn owner_of(&self, mandate_id: &String) -> Address {
        self.owners
            .get(mandate_id)
            .unwrap_or_revert_with(&self.env(), MandateError::MandateNotFound)
    }

    fn agent_of(&self, mandate_id: &String) -> Address {
        self.agents
            .get(mandate_id)
            .unwrap_or_revert_with(&self.env(), MandateError::MandateNotFound)
    }

    fn require_owner(&self, mandate_id: &String) -> Address {
        let owner = self.owner_of(mandate_id);
        if self.env().caller() != owner {
            self.env().revert(MandateError::Unauthorized);
        }
        owner
    }

    fn require_owner_or_agent(&self, mandate_id: &String) {
        let owner = self.owner_of(mandate_id);
        let agent = self.agent_of(mandate_id);
        let caller = self.env().caller();
        if caller != owner && caller != agent {
            self.env().revert(MandateError::Unauthorized);
        }
    }
}

#[odra::module]
pub struct ReceiptLedger {
    receipt_count: Var<u64>,
    last_receipt_id: Var<String>,
    last_agent_id: Var<String>,
    last_service_id: Var<String>,
    last_action_hash: Var<String>,
    last_result_hash: Var<String>,
    last_policy_hash: Var<String>,
    last_amount: Var<u64>,
}

#[odra::module]
impl ReceiptLedger {
    pub fn init(&mut self) {
        self.receipt_count.set(0);
    }

    pub fn write_receipt(
        &mut self,
        agent_id: String,
        service_id: String,
        action_hash: String,
        result_hash: String,
        policy_hash: String,
        amount: u64,
    ) -> String {
        let next_id = self.receipt_count.get_or_default() + 1;
        let receipt_id = String::from("receipt-latest");

        self.receipt_count.set(next_id);
        self.last_receipt_id.set(receipt_id.clone());
        self.last_agent_id.set(agent_id);
        self.last_service_id.set(service_id);
        self.last_action_hash.set(action_hash);
        self.last_result_hash.set(result_hash);
        self.last_policy_hash.set(policy_hash);
        self.last_amount.set(amount);

        receipt_id
    }

    pub fn receipt_count(&self) -> u64 {
        self.receipt_count.get_or_default()
    }

    pub fn last_receipt_id(&self) -> String {
        self.last_receipt_id.get_or_default()
    }

    pub fn last_agent_id(&self) -> String {
        self.last_agent_id.get_or_default()
    }

    pub fn last_amount(&self) -> u64 {
        self.last_amount.get_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::{MandateError, MandateGuard, ReceiptLedger};
    use odra::host::{Deployer, NoArgs};

    #[test]
    fn writes_receipt_commitment() {
        let env = odra_test::env();
        let mut ledger = ReceiptLedger::deploy(&env, NoArgs);

        let receipt_id = ledger.write_receipt(
            "agent-rwa-001".to_string(),
            "svc-rwa-risk".to_string(),
            "hash-action".to_string(),
            "hash-result".to_string(),
            "hash-policy".to_string(),
            10,
        );

        assert_eq!(receipt_id, "receipt-latest");
        assert_eq!(ledger.receipt_count(), 1);
        assert_eq!(ledger.last_agent_id(), "agent-rwa-001");
        assert_eq!(ledger.last_amount(), 10);
    }

    #[test]
    fn owner_delegates_bounded_spending_to_agent() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        let mut guard = MandateGuard::deploy(&env, NoArgs);
        let now = env.block_time();

        guard.create_mandate(
            "mandate-001".to_string(),
            agent,
            "agent-rwa-001".to_string(),
            "sha256:policy".to_string(),
            "svc-rwa-risk".to_string(),
            25_000_000_000,
            50_000_000_000,
            20_000_000_000,
            now,
            now + 7 * 86_400_000,
        );

        assert_eq!(guard.owner("mandate-001".to_string()), owner);
        assert_eq!(guard.agent("mandate-001".to_string()), agent);

        env.set_caller(agent);
        let spent = guard.authorize_action(
            "mandate-001".to_string(),
            "hash-action-1".to_string(),
            "svc-rwa-risk".to_string(),
            10_000_000_000,
        );
        assert_eq!(spent, 10_000_000_000);
        assert_eq!(guard.spent_today("mandate-001".to_string()), 10_000_000_000);

        env.set_caller(agent);
        guard.record_settlement(
            "mandate-001".to_string(),
            "hash-action-1".to_string(),
            "hash-x402-settlement".to_string(),
            "hash-result".to_string(),
        );
        assert_eq!(
            guard.settlement_hash(
                "mandate-001".to_string(),
                "hash-action-1".to_string()
            ),
            "hash-x402-settlement"
        );
    }

    #[test]
    fn contract_rejects_overspend_duplicate_and_unauthorized_revocation() {
        let env = odra_test::env();
        let agent = env.get_account(1);
        let stranger = env.get_account(2);
        let mut guard = MandateGuard::deploy(&env, NoArgs);
        let now = env.block_time();
        guard.create_mandate(
            "mandate-002".to_string(),
            agent,
            "agent-rwa-001".to_string(),
            "sha256:policy".to_string(),
            "svc-rwa-risk".to_string(),
            25_000_000_000,
            50_000_000_000,
            20_000_000_000,
            now,
            now + 7 * 86_400_000,
        );

        env.set_caller(agent);
        let over = guard.try_authorize_action(
            "mandate-002".to_string(),
            "hash-over".to_string(),
            "svc-rwa-risk".to_string(),
            100_000_000_000,
        );
        assert_eq!(over.unwrap_err(), MandateError::AmountOverLimit.into());

        env.set_caller(agent);
        guard.authorize_action(
            "mandate-002".to_string(),
            "hash-once".to_string(),
            "svc-rwa-risk".to_string(),
            10_000_000_000,
        );
        env.set_caller(agent);
        let duplicate = guard.try_authorize_action(
            "mandate-002".to_string(),
            "hash-once".to_string(),
            "svc-rwa-risk".to_string(),
            10_000_000_000,
        );
        assert_eq!(duplicate.unwrap_err(), MandateError::DuplicateAction.into());

        env.set_caller(stranger);
        let revoke = guard.try_revoke_mandate("mandate-002".to_string());
        assert_eq!(revoke.unwrap_err(), MandateError::Unauthorized.into());
        assert!(guard.is_active("mandate-002".to_string()));
    }
}

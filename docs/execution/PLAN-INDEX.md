# Approved Studbook 3D plan

Owner-approved direction: evolve the existing Fly-hosted Studbook, preserve its breeding/management game and player assets, add persistent 3D horse identities and a server-simulated live race, then integrate NFTs safely.

## Full planning artifacts

- [Master plan, editable Markdown](https://d2ol7oe51mr4n9.cloudfront.net/user_3KyFSDOS9fOAEJYue9ZEhXEnxpo/d4286639-e3b8-4fed-8f8e-d0f0307e6700.md)
- [61-task backlog, CSV](https://d2ol7oe51mr4n9.cloudfront.net/user_3KyFSDOS9fOAEJYue9ZEhXEnxpo/ecf7311b-de7a-482a-8b8a-2d417734ec90.csv)
- [Access and first-stage checklist](https://d2ol7oe51mr4n9.cloudfront.net/user_3KyFSDOS9fOAEJYue9ZEhXEnxpo/1ab936ba-108e-42ab-82a0-02529ede46b1.md)
- [Complete planning package](https://d2ol7oe51mr4n9.cloudfront.net/user_3KyFSDOS9fOAEJYue9ZEhXEnxpo/0e9ffd67-2abf-4257-99ba-d1dd55b84674.zip)

Master plan SHA-256: `0b51fe7b47cf33906581d463197890107648e6c8e96ae32fc4fe5124995bb9ea`.
Backlog SHA-256: `b212633695356b9de89411ff55b9d01ac9bf1f994cad749eb2f962739dee15d6`.

## Phase order

F0 inventory/protection -> F1 integrity fixes -> F2 transactional persistence -> F3 approved 3D horse -> F4 deterministic race engine -> F5 complete vertical slice -> F6 authoritative multiplayer -> F7 closed alpha/hardening -> F8 testnet -> F9 external audit and explicit real-money gate.

F3 can proceed in parallel only after its dependencies, licensing and cost approvals. Dependencies are defined by the CSV, not by this compressed summary.

## Standing constraints

- No resetting player assets when joining a league.
- League deadlines remain server-owned; interactive live rooms are a separate competitive format.
- Real-time simulation determines the result; replay records what happened.
- 5% market fee, breeder royalty beneficiary fixed at foaling, and claim policy require explicit reconciliation before enabling financial flows.
- Backups/restoration precede production migrations; hardware testing precedes graphics performance claims; testnet and independent audit precede mainnet/real money.
- Access credentials belong in secure runtime configuration, never in this plan or repository.

See [STATUS.md](STATUS.md) for current evidence and remaining work.

F4 race engine (in review, not wired into the live game): [F4-RACE-ENGINE.md](F4-RACE-ENGINE.md).

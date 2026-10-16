# 특성 설계 · v0.12.0

상위 특성은 아래 효과로 재설계되며 재료의 효과를 자동 계승하지 않습니다. 모든 보조 공격은 직접 처치 후 일반 적에게만 적용되고, 적 한 기는 같은 이동에서 보조 공격에 한 번만 맞습니다.

## 1티어

| 특성 | 효과 | 재료 |
| --- | --- | --- |
| IMPACT CORE | 2칸 이상 이동해 직접 처치 시 주변 1칸의 일반 적 최대 1기에게 1피해 | 레벨업 |
| DIAGONAL BURST | 직접 처치 시 대각선 1칸의 일반 적 최대 1기에게 1피해 | 레벨업 |
| LONG STRIDE | 기본 사거리 +1 (나이트는 긴 L자 추가) | 레벨업 |
| ROYAL STEP | 상하좌우 1칸 이동 추가 | 레벨업 |
| ARC MAGNET | 직접 처치 시 주변 1칸의 내구도가 낮은 일반 적 최대 1기에게 1피해 | 레벨업 |
| CHAIN SPARK | 직접 처치 4회마다 XP +1 | 레벨업 |
| ECHO BLADE | 직접 처치 시 이동 방향 직선 2칸의 일반 적 최대 1기에게 1피해 | 레벨업 |
| FORK | 직접 처치 시 나이트 위치 2칸의 일반 적 최대 1기에게 1피해 | 레벨업 |
| CROSS CHECK | 1칸 이동해 직접 처치 시 상하좌우 1칸의 일반 적 최대 1기에게 1피해 | 레벨업 |
| SLIPSTREAM | 직접 처치 후 비공격 이동을 1회 더 허용 · 전체 탈출 효과 공유 재사용 6적 턴 | 레벨업 |

## 2티어

| 특성 | 효과 | 재료 |
| --- | --- | --- |
| KINETIC CROWN | 직접 처치 시 대각선 1칸의 일반 적 최대 2기에게 1피해 | IMPACT CORE + DIAGONAL BURST |
| ROYAL VECTOR | 기본 사거리 +1 (나이트는 긴 L자 추가) / 상하좌우 1칸 이동 추가 | LONG STRIDE + ROYAL STEP |
| ARC RELAY | 직접 처치 시 주변 2칸의 일반 적 최대 2기에게 1피해 · 재사용 1적 턴 | ARC MAGNET + CHAIN SPARK |
| FORKED ECHO | 직접 처치 시 나이트 위치 2칸의 일반 적 최대 2기에게 1피해 | ECHO BLADE + FORK |
| CROSS CURRENT | CHAIN 2부터, 직접 처치 시 상하좌우 2칸의 일반 적 최대 2기에게 1피해 | CROSS CHECK + SLIPSTREAM |
| TACTICAL DRIFT | 기본 사거리 +1 (나이트는 긴 L자 추가) / 직접 처치 후 비공격 이동을 1회 더 허용 · 전체 탈출 효과 공유 재사용 6적 턴 | LONG STRIDE + SLIPSTREAM |

## 3티어

| 특성 | 효과 | 재료 |
| --- | --- | --- |
| PRISMATIC IMPACT | 기본 사거리 +1 (나이트는 긴 L자 추가) / 2칸 이상 이동해 직접 처치 시 대각선 2칸의 일반 적 최대 3기에게 1피해 | KINETIC CROWN + ROYAL VECTOR |
| SOVEREIGN RELAY | 상하좌우 1칸 이동 추가 / 직접 처치 시 상하좌우 2칸의 일반 적 최대 2기에게 1피해 · 재사용 1적 턴 / 직접 처치 4회마다 XP +1 | ROYAL VECTOR + ARC RELAY |
| STORM FORK | CHAIN 2부터, 직접 처치 시 나이트 위치 2칸의 일반 적 최대 3기에게 1피해 | ARC RELAY + FORKED ECHO |
| ECHO CURRENT | 직접 처치 시 이동 방향 직선 3칸의 일반 적 최대 3기에게 1피해 · 재사용 1적 턴 | FORKED ECHO + CROSS CURRENT |
| CURRENT DRIFT | 기본 사거리 +1 (나이트는 긴 L자 추가) / 직접 처치 후 비공격 이동을 1회 더 허용 · 전체 탈출 효과 공유 재사용 4적 턴 | CROSS CURRENT + TACTICAL DRIFT |
| CROWN DRIFT | 2칸 이상 이동해 직접 처치 시 주변 1칸의 일반 적 최대 3기에게 1피해 · 재사용 1적 턴 | TACTICAL DRIFT + KINETIC CROWN |

## 4티어

| 특성 | 효과 | 재료 |
| --- | --- | --- |
| ASTRAL CROWN | CHAIN 3부터, 직접 처치 시 바깥 고리 2칸의 일반 적 최대 5기에게 1피해 · 재사용 2적 턴 | PRISMATIC IMPACT + SOVEREIGN RELAY |
| THUNDER REGENT | 직접 처치 시 상하좌우 3칸의 일반 적 최대 4기에게 1피해 · 재사용 2적 턴 | SOVEREIGN RELAY + STORM FORK |
| ECHO MONARCH | 직접 처치 시 이동 방향 전방 부채꼴 3칸의 일반 적 최대 4기에게 1피해 · 재사용 1적 턴 | STORM FORK + ECHO CURRENT |
| CIRCUIT SOVEREIGN | CHAIN 2부터, 직접 처치 시 나이트 위치와 인접 상하좌우 2칸의 일반 적 최대 4기에게 1피해 · 재사용 1적 턴 | ECHO CURRENT + CURRENT DRIFT |
| DRIFT EMPEROR | 기본 사거리 +2 (나이트는 긴 L자 추가) / 상하좌우 1칸 이동 추가 / 직접 처치 후 비공격 이동을 1회 더 허용 · 전체 탈출 효과 공유 재사용 5적 턴 | CURRENT DRIFT + CROWN DRIFT |
| PRISMATIC EMPEROR | 2칸 이상 이동해 직접 처치 시 대각선 3칸의 일반 적 최대 4기에게 1피해 · 재사용 1적 턴 | CROWN DRIFT + PRISMATIC IMPACT |

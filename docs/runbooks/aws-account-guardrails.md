# AWS Account Guardrails

This runbook records the public, non-sensitive verification evidence for
[issue #3](https://github.com/boversauros/admintonibover/issues/3). It covers
account security and cost controls that must exist before application resources
are deployed.

## Disclosure boundary

Exact account metadata and console evidence are retained privately. Do not add
AWS account IDs, sign-in URLs, contact details, credit balances or expiry dates,
MFA details, access keys, ARNs, invoices, payment information, or console
screenshots to this repository.

## Configuration

| Control                | Verified state                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account status         | The account plan and promotional-credit status were reviewed in Billing. Exact values are retained privately.                                     |
| Root protection        | MFA is assigned and the root user has zero access keys.                                                                                           |
| Recovery contacts      | The account contact configuration was reviewed. Contact details are retained privately.                                                           |
| Programmatic access    | No long-lived AWS access keys were created.                                                                                                       |
| Billing preferences    | PDF invoice delivery and Free Tier usage alerts are enabled.                                                                                      |
| Zero-spend budget      | An email-only zero-spend budget is configured without actions or SNS.                                                                             |
| Monthly budget         | `admintonibover-monthly-5-usd` is set to USD 5 per month, with an actual alert at 20% and a forecast alert at 100%.                               |
| Cost anomaly detection | `admintonibover-all-services` monitors all AWS services. `admintonibover-daily-1-usd` sends a daily email summary at an absolute USD 1 threshold. |
| Home Region            | Application resources must use `eu-west-1`.                                                                                                       |
| Cost baseline          | Current-month charges were verified as USD 0.                                                                                                     |
| Resource baseline      | An all-Region review found only AWS-created default networking resources and no application resources.                                            |

Budgets and anomaly notifications are warnings, not spending caps. An alert
requires a manual review and, when necessary, removal or shutdown of the
resource causing the cost.

## Resource tags

Apply these tags to future application resources where the AWS service supports
them:

| Key           | Value            |
| ------------- | ---------------- |
| `Project`     | `admintonibover` |
| `Environment` | `dev` or `prod`  |
| `ManagedBy`   | `iac`            |
| `Owner`       | `orio`           |

`ManagedBy=iac` applies only to resources managed by infrastructure as code. It
must not be added to manually configured account guardrails.

## Accepted exceptions

The account owner accepted the following proportionate exceptions for the
current single-person, standalone account:

1. IAM Identity Center and AWS Organizations are deferred. Enabling an
   organization would end the account's promotional-credit eligibility. The
   access model must be reviewed before production deployment or adding another
   administrator.
2. Additional Billing, Operations, and Security contacts are deferred. The
   primary account contact remains the notification and recovery contact.
3. Cost Anomaly Detection uses a daily email summary instead of an individual
   alert. Individual alerts require SNS, while the issue explicitly excludes
   SNS for this setup.
4. Public verification uses the attestations in this runbook instead of console
   screenshots or exact account metadata.

These exceptions do not permit AWS credentials in source control, browser
storage, deployment-platform settings, screenshots, or documentation.

## Pre-deployment check

Before creating application infrastructure:

1. Confirm the console is set to `eu-west-1`.
2. Confirm both budgets and the anomaly subscription are active.
3. Review current-month charges and investigate any unexpected service.
4. Search all Regions for unexplained resources.
5. Confirm the deployment path uses temporary credentials and creates no
   long-lived access keys.
6. Apply the agreed resource tags through infrastructure as code.

Any unexplained cost, resource, or credential blocks deployment until it is
understood.

## Alert response

When a budget or anomaly email arrives:

1. Open Billing and Cost Management and review **Bills** and **Cost Explorer**.
2. Identify the service and Region responsible for the charge.
3. Stop or delete unintended billable resources from that service's console.
4. Recheck costs after AWS refreshes the billing data.
5. Record any intentional cost change in the infrastructure pull request.

## Removal

Budgets and anomaly subscriptions can be removed from Billing and Cost
Management if they are replaced by equivalent controls. Do not remove root MFA
or the primary recovery contact.

## Expected cost

Expected monthly cost for these guardrails is USD 0. AWS Budgets without actions
are free, and AWS Cost Anomaly Detection is available at no additional cost.

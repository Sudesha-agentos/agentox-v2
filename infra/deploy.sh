#!/bin/bash
# agentox on AWS: one script for the whole lifecycle.
#
#   infra/deploy.sh plan      create a change set and print exactly what would change
#   infra/deploy.sh apply     execute that change set and wait for it
#   infra/deploy.sh release   build the interface, ship it with the launcher, (re)start the server
#   infra/deploy.sh status    stack outputs and a health check
#
# Settings (environment): AWS_PROFILE (agentox-admin), AWS_REGION (ap-south-1),
# STACK (agentox), ALERT_EMAIL (required for plan), APP_DOMAIN (app.agentox.io).
set -euo pipefail
cd "$(dirname "$0")/.."

export AWS_PROFILE="${AWS_PROFILE:-agentox-admin}"
export AWS_REGION="${AWS_REGION:-ap-south-1}"
STACK="${STACK:-agentox}"
TEMPLATE=infra/agentox.yaml
CHANGESET="$STACK-pending"

out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
stack_exists() { aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; }

ssm_run() {
  # Runs shell commands on the server through Run Command and prints their output.
  local instance="$1"; shift
  local params
  params=$(jq -nc --args '{commands: $ARGS.positional}' "$@")
  local id
  id=$(aws ssm send-command --instance-ids "$instance" --document-name AWS-RunShellScript \
    --parameters "$params" --timeout-seconds 900 --query Command.CommandId --output text)
  aws ssm wait command-executed --command-id "$id" --instance-id "$instance" 2>/dev/null || true
  aws ssm get-command-invocation --command-id "$id" --instance-id "$instance" \
    --query '[Status, StandardOutputContent, StandardErrorContent]' --output text
  [ "$(aws ssm get-command-invocation --command-id "$id" --instance-id "$instance" --query Status --output text)" = "Success" ]
}

case "${1:-}" in
  plan)
    : "${ALERT_EMAIL:?set ALERT_EMAIL to the address for health alerts}"
    aws cloudformation validate-template --template-body "file://$TEMPLATE" >/dev/null
    aws cloudformation delete-change-set --stack-name "$STACK" --change-set-name "$CHANGESET" >/dev/null 2>&1 || true
    # A stack that has only ever been previewed sits in REVIEW_IN_PROGRESS and still needs a CREATE.
    status=$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo NONE)
    type=UPDATE; case "$status" in NONE|REVIEW_IN_PROGRESS) type=CREATE ;; esac
    aws cloudformation create-change-set --stack-name "$STACK" --change-set-name "$CHANGESET" \
      --change-set-type "$type" --template-body "file://$TEMPLATE" --capabilities CAPABILITY_IAM \
      --parameters ParameterKey=AlertEmail,ParameterValue="$ALERT_EMAIL" ParameterKey=AppDomain,ParameterValue="${APP_DOMAIN:-app.agentox.io}" \
      --tags Key=project,Value=agentox >/dev/null
    aws cloudformation wait change-set-create-complete --stack-name "$STACK" --change-set-name "$CHANGESET" || {
      aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "$CHANGESET" --query StatusReason --output text; exit 1; }
    echo "Change set for stack '$STACK' ($type) in $AWS_REGION:"
    aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "$CHANGESET" \
      --query 'Changes[].ResourceChange.[Action, ResourceType, LogicalResourceId, Replacement]' --output table
    echo "Review, then run: infra/deploy.sh apply"
    ;;

  apply)
    # A stack that was only ever previewed is still being created; anything else is an update.
    # (Picking the waiter up front matters: the create waiter passes instantly on an old CREATE_COMPLETE.)
    before=$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text)
    aws cloudformation execute-change-set --stack-name "$STACK" --change-set-name "$CHANGESET"
    echo "Applying change set; this takes a few minutes..."
    if [ "$before" = "REVIEW_IN_PROGRESS" ]; then
      aws cloudformation wait stack-create-complete --stack-name "$STACK"
    else
      aws cloudformation wait stack-update-complete --stack-name "$STACK"
    fi
    aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].Outputs' --output table
    ;;

  release)
    instance=$(out InstanceId); host=$(out AppHost); bucket=$(out BackupBucket); mail=$(out MailDomain)
    id="$(date -u +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD)"
    echo "Building the interface..."
    npm run build >/dev/null
    npm run build:gateway >/dev/null
    tarball="$(mktemp -d)/agentox-$id.tgz"
    COPYFILE_DISABLE=1 tar --no-xattrs -czf "$tarball" dist scripts package.json infra/server gateway/dist gateway/install.sh
    aws s3 cp "$tarball" "s3://$bucket/releases/agentox-$id.tgz" --only-show-errors
    echo "Waiting for the server to finish its first-boot setup..."
    for _ in $(seq 1 60); do
      if aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$instance" \
        --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null | grep -q Online; then break; fi
      sleep 10
    done
    ssm_run "$instance" \
      "for i in \$(seq 1 60); do [ -f /var/lib/agentox/bootstrap.done ] && break; sleep 10; done" \
      "set -euo pipefail" \
      "aws s3 cp s3://$bucket/releases/agentox-$id.tgz /tmp/release.tgz --region $AWS_REGION --only-show-errors" \
      "mkdir -p /opt/agentox/releases/$id && tar -xzf /tmp/release.tgz -C /opt/agentox/releases/$id && rm -f /tmp/release.tgz" \
      "bash /opt/agentox/releases/$id/infra/server/install-release.sh $id $host $bucket $AWS_REGION ${mail:-agentox.io}"
    echo "Released $id to https://$host"
    ;;

  status)
    aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].[StackStatus]' --output text
    aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].Outputs' --output table
    host=$(out AppHost); ip=$(out PublicIp)
    echo "DNS:    $host -> $(dig +short A "$host" | tail -1) (expected $ip)"
    echo "Health: $(curl -fsS --max-time 10 "https://$host/api/health" || echo 'not reachable yet')"
    ;;

  *)
    sed -n '2,12p' "$0"; exit 1 ;;
esac

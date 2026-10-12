#!/usr/bin/env bash
set -euo pipefail
systemctl --user stop crm-client-demo.service
printf '%s\n' 'The public CRM demo is stopped.'

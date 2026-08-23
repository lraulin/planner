CREATE FUNCTION pg_temp.finance_normalize_merchant(input text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
	result text := regexp_replace(ltrim(input), '^&\s*', '');
	prefix text;
	previous text;
BEGIN
	FOREACH prefix IN ARRAY ARRAY[
		'Preauthorized Withdrawal to ', 'Preauthorized Deposit from ',
		'Instant transfer received from ', 'Overdraft Transfer from ',
		'Overdraft Transfer to ', 'Debit Card Purchase - ', 'Withdrawal from ',
		'Withdrawal to ', 'Deposit from ', 'Deposit to '
	] LOOP
		IF upper(left(result, length(prefix))) = upper(prefix) THEN
			result := substr(result, length(prefix) + 1);
			EXIT;
		END IF;
	END LOOP;
	FOREACH prefix IN ARRAY ARRAY[
		'PAYPAL *', 'PP*', 'WL *', 'SQ *', 'TST* ', 'ANC*', 'PHR*', 'LOY*',
		'IN *', 'SP '
	] LOOP
		IF upper(left(result, length(prefix))) = upper(prefix) THEN
			result := substr(result, length(prefix) + 1);
			EXIT;
		END IF;
	END LOOP;
	result := rtrim(upper(result));
	FOREACH prefix IN ARRAY ARRAY[
		' DIRECT DEP', ' DIRDEP', ' PAYROLL', ' TRNSFR DR', ' TRNSFR CR'
	] LOOP
		IF right(result, length(prefix)) = prefix THEN
			result := left(result, -length(prefix));
			EXIT;
		END IF;
	END LOOP;
	result := regexp_replace(result, '\.(COM|NET|ORG|AI|IO|CO)\y', '', 'g');
	LOOP
		previous := result;
		result := regexp_replace(result, '\*[A-Z0-9]*[0-9][A-Z0-9]*$', '');
		result := regexp_replace(result, '\*+$', '');
		result := regexp_replace(result, '([0-9])\s+[A-Z]$', '\1');
		result := rtrim(regexp_replace(result, '\s*#?\s*[0-9][0-9-]*[A-Z]{0,2}$', ''));
		EXIT WHEN result = previous;
	END LOOP;
	RETURN btrim(regexp_replace(result, '\s+', ' ', 'g'));
END $$;--> statement-breakpoint
DO $$
DECLARE
	legacy record;
	normalized text;
BEGIN
	-- Every legacy token must still resolve to a payee claimed by that exact commitment.
	FOR legacy IN
		SELECT 'bill'::text AS kind, b.id, b.user_id, b.name, unnest(b.matchers) AS matcher
		FROM finance_recurring_bills b
		UNION ALL
		SELECT 'spend'::text, s.id, s.user_id, s.name, unnest(s.matchers)
		FROM finance_recurring_spend s
	LOOP
		normalized := pg_temp.finance_normalize_merchant(legacy.matcher);
		IF normalized = '' OR NOT EXISTS (
			SELECT 1
			FROM finance_payees p
			LEFT JOIN finance_payee_aliases a
				ON a.user_id = p.user_id AND a.payee_id = p.id
			WHERE p.user_id = legacy.user_id
				AND CASE legacy.kind
					WHEN 'bill' THEN p.commitment_bill_id = legacy.id
					ELSE p.commitment_spend_id = legacy.id
				END
				AND (a.alias = normalized OR lower(p.name) = lower(btrim(legacy.matcher)))
		) THEN
			RAISE EXCEPTION 'payee cutover refused: unresolved % matcher "%" on commitment "%"',
				legacy.kind, legacy.matcher, legacy.name;
		END IF;
	END LOOP;

	-- Claim foreign keys cannot express ownership; reject a cross-user target before dropping
	-- the source arrays that made the bridge auditable.
	IF EXISTS (
		SELECT 1 FROM finance_payees p
		WHERE p.commitment_bill_id IS NOT NULL
			AND NOT EXISTS (
				SELECT 1 FROM finance_recurring_bills b
				WHERE b.id = p.commitment_bill_id AND b.user_id = p.user_id
			)
	) OR EXISTS (
		SELECT 1 FROM finance_payees p
		WHERE p.commitment_spend_id IS NOT NULL
			AND NOT EXISTS (
				SELECT 1 FROM finance_recurring_spend s
				WHERE s.id = p.commitment_spend_id AND s.user_id = p.user_id
			)
	) THEN
		RAISE EXCEPTION 'payee cutover refused: a commitment claim crosses user ownership';
	END IF;

	IF EXISTS (
		SELECT 1 FROM finance_schedules
		WHERE jsonb_typeof(conditions) IS DISTINCT FROM 'array'
	) THEN
		RAISE EXCEPTION 'payee cutover refused: schedule conditions are not an array';
	END IF;

	-- Payee conditions must contain only same-user stable ids. Other condition fields retain
	-- their existing Actual-shaped validation in the application parser.
	IF EXISTS (
		SELECT 1
		FROM finance_schedules s
		CROSS JOIN LATERAL jsonb_array_elements(s.conditions) condition
		WHERE condition->>'field' = 'payee'
			AND (
				condition->>'op' IS NULL
				OR condition->>'op' NOT IN ('is', 'oneOf')
				OR (condition->>'op' = 'is' AND (
					jsonb_typeof(condition->'value') <> 'string'
					OR condition->>'value' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
					OR NOT EXISTS (
						SELECT 1 FROM finance_payees p
						WHERE p.user_id = s.user_id AND p.id::text = condition->>'value'
					)
				))
				OR (condition->>'op' = 'oneOf' AND (
					jsonb_typeof(condition->'value') <> 'array'
					OR jsonb_array_length(
						CASE WHEN jsonb_typeof(condition->'value') = 'array'
							THEN condition->'value' ELSE '[]'::jsonb END
					) = 0
					OR EXISTS (
						SELECT 1
						FROM jsonb_array_elements(
							CASE WHEN jsonb_typeof(condition->'value') = 'array'
								THEN condition->'value' ELSE '[]'::jsonb END
						) item
						WHERE jsonb_typeof(item) <> 'string'
							OR item#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
							OR NOT EXISTS (
								SELECT 1 FROM finance_payees p
								WHERE p.user_id = s.user_id AND p.id::text = item#>>'{}'
							)
					)
				))
			)
	) THEN
		RAISE EXCEPTION 'payee cutover refused: a schedule has an invalid or dangling payee condition';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" DROP COLUMN "matchers";--> statement-breakpoint
ALTER TABLE "finance_recurring_spend" DROP COLUMN "matchers";

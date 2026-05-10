package handler

import "database/sql"

func nullInt64ToValue(value sql.NullInt64) any {
	if !value.Valid {
		return nil
	}

	return value.Int64
}

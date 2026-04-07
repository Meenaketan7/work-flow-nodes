import { Dispatch, SetStateAction, useEffect, useState } from "react";

export const useDebounce = <T extends string | number | object>(
	value: T,
	delay = 500
): [T, Dispatch<SetStateAction<T>>] => {
	// State and setters for debounced value
	const [debouncedValue, setDebouncedValue] = useState(value);

	useEffect(() => {
		// Update debounced value after delay
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		// Cancel the timeout if value changes (also on delay change or unmount)
		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]);

	return [debouncedValue, setDebouncedValue];
};

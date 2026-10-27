import "@testing-library/jest-dom/vitest";

import { configure } from "@testing-library/react";

// Waiting for the editor to draw (OSMD loaded on first use) can take longer than the default second when every
// package's tests run at once.
configure({ asyncUtilTimeout: 5000 });

import userEvent from "@testing-library/user-event"

export const setupUser = () => userEvent.setup({ delay: null })

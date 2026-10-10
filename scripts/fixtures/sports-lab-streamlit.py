"""Synthetic gateway fixture. Does not import Sports Lab or access its data."""
import streamlit as st

st.title("Synthetic Sports Lab")
st.caption("Gateway verification only. No research data or operations are connected.")
message = st.text_input("Test message")
st.write(f"Received: {message}")

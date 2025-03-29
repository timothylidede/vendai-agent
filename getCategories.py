import pandas as pd

# Step 1: Read the CSV file from the same directory
df = pd.read_csv("one-stop-wholesalers.csv")

# Step 2: Get unique categories from the 'Category' column
categories = df['Category'].unique()

# Step 3: Loop through each category and save to a separate CSV
for category in categories:
    # Filter the DataFrame for the current category
    category_df = df[df['Category'] == category]
    
    # Prepare the filename (replace spaces with underscores)
    filename = f"data/{category.replace(' ', '_')}.txt"
    
    # Save the filtered DataFrame to a CSV file
    category_df.to_csv(filename, index=False)
    print(f"Created CSV: {filename}")

print("All txt files have been generated.")
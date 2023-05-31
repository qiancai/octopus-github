const { Octokit } = require("@octokit/core");
const fs = require('fs');

const source_pr_url = 'https://github.com/pingcap/docs-cn/pull/13895';
//const my_github_id = 'qiancai';
const my_github_token_file_path = '/Users/grcai/Documents/PingCAP/Python_scripts/GitHub/gh_token5.txt';
const access_token = fs.readFileSync(my_github_token_file_path, 'utf8').trim();
const octokit = new Octokit({
    auth: access_token
  });

async function get_my_github_id() {
    try {
        const { data } = await octokit.request('GET /user');
        return data.login;
      } catch (error) {
        console.error('Error:', error);
        throw error;
      }
    }

function get_pr_info(pr_url) {
  return new Promise((resolve, reject) => {
    const url_parts = pr_url.split('/');
    const source_repo_owner = url_parts[3];
    const source_repo_name = url_parts[4];
    const pr_number = url_parts[6];

    octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner: source_repo_owner,
      repo: source_repo_name,
      pull_number: pr_number,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    .then(response => {
      const pr_data = response.data;

      const source_title = pr_data.title;
      const source_description = pr_data.body;
      const exclude_labels = ["size", "translation", "status", "first-time-contributor", "contribution"];
      const source_labels = pr_data.labels
        .filter(label => !exclude_labels.some(exclude_label => label.name.includes(exclude_label)))
        .map(label => label.name);
      const base_repo = pr_data.base.repo.full_name;
      const base_branch = pr_data.base.ref;
      const head_repo = pr_data.head.repo.full_name;
      const head_branch = pr_data.head.ref;

      console.log(`Getting source language PR information was successful. The head branch name is: ${head_branch}`);

      const result = [source_title, source_description, source_labels, base_repo, base_branch, head_repo, head_branch, pr_number];
      resolve(result);
    })
    .catch(error => {
      console.log(`Failed to get source language PR information: ${error.message}`);
      reject(error);
    });
  });
}

async function sync_my_repo_branch(target_repo_owner, target_repo_name, my_repo_owner, my_repo_name, base_branch) {

  try {
    const upstreamRef = await octokit.request('GET /repos/{owner}/{repo}/git/refs/heads/{ref}', {
      owner: target_repo_owner,
      repo: target_repo_name,
      ref: base_branch
    });

    const upstream_sha = upstreamRef.data.object.sha;

    await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
      owner: my_repo_owner,
      repo: my_repo_name,
      ref: `heads/${base_branch}`,
      sha: upstream_sha,
      force: true
    });

    console.log("Syncing the latest content from the upstream branch...");
    console.log("The content sync is successful!");
  } catch (error) {
    console.log("Failed to sync the latest content from the upstream branch.");
    console.log(error);
    throw error;
  }
}

async function create_branch(repo_owner, repo_name, branch_name, base_branch, access_token) {

    try {
      const baseRef = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
        owner: repo_owner,
        repo: repo_name,
        ref: `heads/${base_branch}`
      });

      const base_sha = baseRef.data.object.sha;
      const createRefResponse = await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
        owner: repo_owner,
        repo: repo_name,
        ref: `refs/heads/${branch_name}`,
        sha: base_sha
      });

      if (createRefResponse.status === 201) {
        const branch_url = `https://github.com/${repo_owner}/${repo_name}/tree/${branch_name}`;
        console.log(`A new branch is created successfully. The branch address is: ${branch_url}`);
        return branch_url;
      } else {
        console.log(`Failed to create the branch: ${createRefResponse.message}`);
        throw new Error(`Failed to create the branch: ${createRefResponse.message}`);
      }
    } catch (error) {
      console.log("Failed to create the branch.");
      console.error(error);
      throw error;
    }
  }

// For adding a temporary temp.md file to the new branch
async function create_file_in_branch(repo_owner, repo_name, branch_name, access_token, file_path, file_content, commit_message) {
    try {
      const response = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
        owner: repo_owner,
        repo: repo_name,
        path: file_path,
        branch: branch_name,
        message: commit_message,
        content: Buffer.from(file_content).toString('base64'),
        headers: {
          Accept: 'application/vnd.github.v3+json'
        }
      });

      if (response.status === 201) {
        console.log('A temp file is created successfully!');
        return response.data;
      } else {
        console.log('Failed to create the temp file:', response.statusText);
        throw new Error('Failed to create the temp file: ' + response.statusText);
      }
    } catch (error) {
      console.log('Failed to create the temp file.');
      console.error(error);
    }
  }

// For changing the description of the translation PR
function update_pr_description(source_description,base_repo, target_repo_name) {
    const source_pr_CLA = "https://cla-assistant.io/pingcap/" + base_repo;
    const new_pr_CLA = "https://cla-assistant.io/pingcap/" + target_repo_name;
    let new_pr_description = source_description.replace(source_pr_CLA, new_pr_CLA);

    new_pr_description = new_pr_description.replace("This PR is translated from:", "This PR is translated from: " + source_pr_url);

    if (source_description.includes("tips for choosing the affected versions")) {
        new_pr_description = new_pr_description.replace(/.*?\[tips for choosing the affected version.*?\n\n?/, "");
    }

    return new_pr_description;
}

// For creating a PR in the target repository and adding labels to the target PR
async function create_pull_request(target_repo_owner, target_repo_name, base_branch, my_repo_owner, my_repo_name, new_branch_name, access_token, title, body, labels) {
    try {
      const prResponse = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
        owner: target_repo_owner,
        repo: target_repo_name,
        title: title,
        body: body,
        head: `${my_repo_owner}:${new_branch_name}`,
        base: base_branch,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (prResponse.status === 201) {
        console.log('Pull Request created successfully!');
        const pr_url = prResponse.data.html_url;
        console.log(`Your target PR is created successfully. The PR address is: ${pr_url}`);

        const url_parts = pr_url.split("/");
        const pr_number = url_parts[6];

        // Add labels to the created PR
        const labelsResponse = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
          owner: target_repo_owner,
          repo: target_repo_name,
          issue_number: pr_number,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          },
          data: labels
        });

        if (labelsResponse.status === 200) {
          console.log('Labels are added successfully.');
        } else {
          console.log('Failed to add labels.');
        }
      } else {
        console.log('Failed to create the target PR:', prResponse.statusText);
        throw new Error('Failed to create the target PR: ' + prResponse.statusText);
      }
    } catch (error) {
      console.log('Failed to create the target PR.');
      console.error(error);
    }
  }

// For deleting temp.md
async function delete_file_in_branch(repo_owner, repo_name, branch_name, access_token, file_path, commit_message) {
    try {
      const { data: file_info } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: repo_owner,
        repo: repo_name,
        path: file_path,
        ref: branch_name
      });

      await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
        owner: repo_owner,
        repo: repo_name,
        path: file_path,
        message: commit_message,
        sha: file_info.sha,
        branch: branch_name
      });

      console.log("The temp.md is deleted successfully!");
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`The temp.md file does not exist in branch ${branch_name}.`);
      } else {
        console.log(`Failed to delete temp.md. Error message: ${error.message}`);
      }
      throw error;
    }
  }


  async function main() {
    try {
      const target_repo_owner = "pingcap";
      const my_repo_owner = await get_my_github_id();

      let my_repo_name, target_repo_name, translation_label;

      if (source_pr_url.includes("pingcap/docs-cn/pull")) {
        my_repo_name = "docs";
        target_repo_name = "docs";
        translation_label = "translation/from-docs-cn";
      } else if (source_pr_url.includes("pingcap/docs/pull")) {
        target_repo_name = "docs-cn";
        my_repo_name = "docs-cn";
        translation_label = "translation/from-docs";
      } else {
        console.log("The provided URL is not a pull request of pingcap/docs-cn or pingcap/docs.");
        console.log("Exiting the program...");
        process.exit(1);
      }

      // Step 1. Get the source PR info
      const [source_title, source_description, source_labels, base_repo, base_branch, head_repo, head_branch, pr_number] = await get_pr_info(source_pr_url);
      source_labels.push(translation_label);

      // Step 2. Sync from upstream
      await sync_my_repo_branch(target_repo_owner, target_repo_name, my_repo_owner, my_repo_name, base_branch);

      // Step 3. Create a new branch in the repository that I forked
      const new_branch_name = `${head_branch}-${pr_number}`;
      await create_branch(my_repo_owner, my_repo_name, new_branch_name, base_branch, access_token);

      // Step 4. Create a temporary temp.md file in the new branch
      const file_path = "temp.md";
      const file_content = "This is a test file.";
      const commit_message = "Add temp.md";
      await create_file_in_branch(my_repo_owner, my_repo_name, new_branch_name, access_token, file_path, file_content, commit_message);

      // Step 5. Create a pull request
      const title = source_title;
      const body = update_pr_description(source_description, base_repo, target_repo_name);
      const labels = source_labels;
      await create_pull_request("qiancai", target_repo_name, base_branch, my_repo_owner, my_repo_name, new_branch_name, access_token, title, body, labels);

      // Step 6. Delete the temporary temp.md file
      const commit_message2 = "Delete temp.md";
      await delete_file_in_branch(my_repo_owner, my_repo_name, new_branch_name, access_token, file_path, commit_message2);

      console.log("Done");
    } catch (error) {
      console.error("An error occurred:", error);
    }
  }

main()

